use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token};
use crate::state::*;

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"org_config", org_config.authority.as_ref()],
        bump = org_config.bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        mut,
        seeds = [b"invoice", authority.key().as_ref(), &invoice_account.nonce.to_le_bytes()],
        bump,
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    /// CHECK: PDA only used as signing authority
    #[account(
        seeds = [b"escrow_auth", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: must equal invoice_account.authority (validated by constraint above)
    pub authority: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: payer's SPL token account (validated at runtime)
    pub payer_ata: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: escrow SPL token account owned by escrow authority PDA
    pub escrow_ata: UncheckedAccount<'info>,
    /// CHECK: SPL token mint; key checked against OrgConfig
    pub mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
    let cfg = &ctx.accounts.org_config;
    require!(!cfg.paused, InvoiceError::OrgPaused);

    let inv = &mut ctx.accounts.invoice_account;
    let amount = inv.amount;
    // Escrow before audit: allow funding when invoice is validated
    require!(inv.status == InvoiceStatus::Validated, InvoiceError::InvalidStatus);
    require!(amount <= cfg.per_invoice_cap, InvoiceError::CapExceeded);

    // Ensure mint matches configuration
    require_keys_eq!(ctx.accounts.mint.key(), cfg.mint, InvoiceError::WrongMint);

    // Transfer tokens from payer to escrow
       // Transfer tokens from payer to escrow
    token::transfer( CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
     anchor_spl::token::Transfer {
        from: ctx.accounts.payer_ata.to_account_info(),
        to: ctx.accounts.escrow_ata.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    }),
    amount)?;

    inv.status = InvoiceStatus::InEscrowAwaitingVRF;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleToVendor<'info> {
    #[account(
        mut
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        mut,
        seeds = [b"invoice", authority.key().as_ref(), &invoice_account.nonce.to_le_bytes()],
        bump,
        has_one = authority @ InvoiceError::Unauthorized
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    /// CHECK: PDA only used as signing authority
    #[account(
        seeds = [b"escrow_auth", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: vendor's SPL token account (validated at runtime)
    pub vendor_ata: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: escrow SPL token account owned by escrow authority PDA
    pub escrow_ata: UncheckedAccount<'info>,
    /// CHECK: SPL token mint
    pub mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    /// The invoice owner must authorize settlement
    pub authority: Signer<'info>,
}

pub fn settle_to_vendor(ctx: Context<SettleToVendor>) -> Result<()> {
    let cfg = &ctx.accounts.org_config;
    require!(!cfg.paused, InvoiceError::OrgPaused);

    let inv = &mut ctx.accounts.invoice_account;
    // Settle only when escrowed and cleared to settle
    require!(inv.status == InvoiceStatus::InEscrowReadyToSettle, InvoiceError::InvalidStatus);
    // Ensure due date reached
    let now = Clock::get()?.unix_timestamp;
    require!(now >= inv.due_date, InvoiceError::PaymentNotDue);
    let amount = inv.amount;

    // Sign with escrow authority PDA derived from invoice key
    let bump = ctx.bumps.escrow_authority;
    let invoice_key = inv.key();
    let bump_seed = [bump];
    let signer_seeds: &[&[u8]] = &[b"escrow_auth", invoice_key.as_ref(), &bump_seed];
    let signer = &[signer_seeds];

    token::transfer(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::Transfer {
        from: ctx.accounts.escrow_ata.to_account_info(),
        to: ctx.accounts.vendor_ata.to_account_info(),
        authority: ctx.accounts.escrow_authority.to_account_info(),
    },signer,),amount)?;

    inv.status = InvoiceStatus::Paid;
    Ok(())
}
