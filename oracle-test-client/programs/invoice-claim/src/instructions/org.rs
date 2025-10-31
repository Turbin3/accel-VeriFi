use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct OrgInit<'info> {
    #[account(
        init,
        seeds = [b"org_config", authority.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + OrgConfig::INIT_SPACE,
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn org_init(
    ctx: Context<OrgInit>,
    treasury_vault: Pubkey,
    mint: Pubkey,
    per_invoice_cap: u64,
    daily_cap: u64,
    audit_rate_bps: u16,
) -> Result<()> {
    require!(per_invoice_cap > 0, InvoiceError::InvalidAmount);
    require!(daily_cap > 0, InvoiceError::InvalidAmount);
    require!(daily_cap >= per_invoice_cap, InvoiceError::CapExceeded);
    require!(audit_rate_bps <= 10_000, InvoiceError::InvalidAuditRate); // Max is 100%

    let cfg = &mut ctx.accounts.org_config;
    cfg.set_inner(OrgConfig{
        authority: ctx.accounts.authority.key(),
        oracle_signer: ctx.accounts.authority.key(),
        treasury_vault,
        mint,
        per_invoice_cap,
        daily_cap,
        daily_spent: 0,
        last_reset_day: Clock::get()?.unix_timestamp / 86400,
        audit_rate_bps,
        paused: false,
        invoice_counter: 0,
        version: 1,
        bump: ctx.bumps.org_config
    });

    msg!("Organization initialized - authority: {}", cfg.authority);
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateOrgConfig<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ InvoiceError::Unauthorized,
    )]
    pub org_config: Account<'info, OrgConfig>,
    
}

pub fn update_org_config(
    ctx: Context<UpdateOrgConfig>,
    args: UpdateOrgConfigArgs,
) -> Result<()> {
    let cfg = &mut ctx.accounts.org_config;

    if let (Some(per_invoice_cap), Some(daily_cap)) = (args.per_invoice_cap, args.daily_cap) {
        require!(per_invoice_cap > 0, InvoiceError::InvalidAmount);
        require!(daily_cap > 0, InvoiceError::InvalidAmount);
        require!(daily_cap >= per_invoice_cap, InvoiceError::CapExceeded);
        cfg.per_invoice_cap = per_invoice_cap;
        cfg.daily_cap = daily_cap;
        msg!("Caps updated: per_invoice_cap={}, daily_cap={}", per_invoice_cap, daily_cap);
    }

    if let Some(paused) = args.paused {
        cfg.paused = paused;
        msg!("Pause state updated: {}", paused);
    }

    if let Some(oracle_signer) = args.oracle_signer {
        cfg.oracle_signer = oracle_signer;
        msg!("Oracle signer updated to: {}", oracle_signer);
    }

    if let Some(mint) = args.mint {
        require!(mint != Pubkey::default(), InvoiceError::WrongMint);
        cfg.mint = mint;
        msg!("Mint updated to: {}", mint);
    }

    Ok(())
}
