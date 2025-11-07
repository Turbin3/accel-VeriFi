use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_accounts};

#[commit]
#[derive(Accounts)]
pub struct FundEscrowOnER<'info> {
    #[account(mut)]
    pub payer: Signer<'info>, // pays rent and fees

    #[account(mut)]
    pub funder: Signer<'info>, // funds the escrow (provides SPL tokens)

    #[account(
        mut,
        seeds = [b"org_config"],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        mut,
        seeds = [b"invoice_account", invoice_account.key().as_ref()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    // Initialize escrow token account if not exists
    #[account(
        init_if_needed,
        payer = payer,
        token::mint = mint,
        token::authority = escrow_authority,
        seeds = [b"escrow_token", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA signer for escrow vault
    #[account(
        seeds = [b"escrow_authority", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    // Funder's SPL token account (source)
    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key() @ InvoiceError::InvalidFunder,
        constraint = funder_token_account.mint == mint.key() @ InvoiceError::WrongMint
    )]
    pub funder_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// CHECK: MagicBlock ER context
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: MagicBlock program for commits
    pub magic_program: UncheckedAccount<'info>,
}

/// Transfers SPL tokens to escrow token account
pub fn fund_escrow_on_er(ctx: Context<FundEscrowOnER>, amount: u64) -> Result<()> {
    msg!("Funding escrow inside MagicBlock ER...");
    let invoice = &mut ctx.accounts.invoice_account;
    let org_config = &ctx.accounts.org_config;

    // Validate invoice and org state
    require!(
        matches!(
            invoice.status,
            InvoiceStatus::Extracted | InvoiceStatus::Validated
        ),
        InvoiceError::InvalidStatus
    );
    require!(amount >= invoice.amount, InvoiceError::InvalidAmount);
    require_keys_eq!(
        ctx.accounts.mint.key(),
        org_config.mint,
        InvoiceError::WrongMint
    );

    // Check to ensure is funder is authorized to fund the invoice
    require_keys_eq!(
        invoice.authority,
        ctx.accounts.funder.key(),
        InvoiceError::Unauthorized
    );

    // Transfer SPL tokens: funder -> escrow vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.funder_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.funder.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    invoice.status = InvoiceStatus::InEscrowAwaitingVRF;

    invoice.exit(&crate::ID)?;

    commit_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.invoice_account.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct SettleOnER<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"org_config"],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        mut,
        seeds = [b"invoice_account", invoice_account.key().as_ref()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    // Escrow's token account (source)
    #[account(
        mut,
        seeds = [b"escrow_token", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    // PDA authority that owns escrow token account
    /// CHECK: PDA authority for escrow token account
    #[account(
        seeds = [b"escrow_authority", invoice_account.authority.as_ref()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    // Vendor's token account (destination)
    #[account(
        mut,
        constraint = vendor_token_account.mint == org_config.mint @ InvoiceError::WrongMint
    )]
    pub vendor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    /// CHECK: MagicBlock ER context
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: MagicBlock program for commits
    pub magic_program: UncheckedAccount<'info>,
}

pub fn settle_to_vendor(ctx: Context<SettleOnER>) -> Result<()> {
    msg!("Settling payment to vendor on ER (PRIVATE)");

    let cfg = &ctx.accounts.org_config;
    require!(!cfg.paused, InvoiceError::OrgPaused);

    let invoice = &mut ctx.accounts.invoice_account;
    // Settle only when escrowed and cleared to settle
    require!(
        invoice.status == InvoiceStatus::InEscrowReadyToSettle,
        InvoiceError::InvalidStatus
    );
    // Ensure due date reached
    let now = Clock::get()?.unix_timestamp;
    require!(now >= invoice.due_date, InvoiceError::PaymentNotDue);
    let amount = invoice.amount;

    // Sign with escrow authority PDA derived from invoice key
    let bump = ctx.bumps.escrow_authority;
    let invoice_key = invoice.key();
    let bump_seed = [bump];
    let signer_seeds: &[&[u8]] = &[b"escrow_authority", invoice_key.as_ref(), &bump_seed];
    let signer = &[signer_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.vendor_token_account.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    invoice.status = InvoiceStatus::Paid;
    invoice.exit(&crate::ID)?;

    // Commit final state
    commit_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.invoice_account.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    msg!("Settlement committed to L1 (payment details remain private)");
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"invoice", invoice_account.authority.as_ref()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    #[account(
        mut,
        seeds = [b"escrow_token", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"escrow_authority", invoice_account.key().as_ref()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,

    // Refund destination (funder's token account)
    #[account(mut)]
    pub funder_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub magic_context: UncheckedAccount<'info>,
    pub magic_program: UncheckedAccount<'info>,
}

pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
    let invoice = &mut ctx.accounts.invoice_account;

    require!(
        invoice.status == InvoiceStatus::Refunded,
        InvoiceError::InvalidStatus
    );

    let amount = invoice.amount;

    // Sign with escrow authority
    let bump = ctx.bumps.escrow_authority;
    let invoice_key = invoice.key();
    let signer_seeds: &[&[u8]] = &[b"escrow_authority", invoice_key.as_ref(), &[bump]];

    // Transfer tokens back to funder
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.funder_token_account.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    invoice.status = InvoiceStatus::Refunded;
    invoice.exit(&crate::ID)?;

    commit_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.invoice_account.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    msg!("Escrow refunded: {} tokens", amount);
    Ok(())
}
