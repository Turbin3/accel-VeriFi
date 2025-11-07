use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_accounts};

#[derive(Accounts)]
pub struct ProcessPayment<'info> {
    #[account(
        mut,
        seeds = [b"invoice_account", authority.key().as_ref()],
        bump,
        has_one = authority
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    pub authority: Signer<'info>,
}

pub fn process_invoice_payment(ctx: Context<ProcessPayment>) -> Result<()> {
    let invoice = &ctx.accounts.invoice_account;
    // Status-only path: treat as logical escrow authorization before VRF
    require!(
        invoice.status == InvoiceStatus::Validated,
        InvoiceError::InvalidStatus
    );

    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time <= invoice.due_date,
        InvoiceError::PaymentOverdue
    );

    msg!("Processing payment for invoice:");
    msg!("Vendor: {}", invoice.vendor_name);
    msg!("Amount: {}", invoice.amount);
    msg!("Due Date: {}", invoice.due_date);

    let invoice_mut = &mut ctx.accounts.invoice_account;
    invoice_mut.status = InvoiceStatus::InEscrowAwaitingVRF;
    msg!("Invoice logically moved to escrow (status-only)");
    Ok(())
}

#[derive(Accounts)]
pub struct CompletePayment<'info> {
    #[account(
        mut,
        seeds = [b"invoice", authority.key().as_ref()],
        bump,
        has_one = authority
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    pub authority: Signer<'info>,
}

pub fn complete_payment(ctx: Context<CompletePayment>) -> Result<()> {
    let invoice = &mut ctx.accounts.invoice_account;
    require!(
        invoice.status == InvoiceStatus::InEscrowReadyToSettle,
        InvoiceError::InvalidStatus
    );
    invoice.status = InvoiceStatus::Paid;
    msg!("Payment completed for vendor: {}", invoice.vendor_name);
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct ValidatePaymentOnER<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"invoice_account", invoice_account.key().as_ref()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    #[account(
        seeds = [b"org_config"],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    /// CHECK: passed through to SDK commit; validated by SDK at runtime
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: program account for MagicBlock ER; SDK uses it
    pub magic_program: UncheckedAccount<'info>,
}

pub fn validate_payment_on_er(ctx: Context<ValidatePaymentOnER>) -> Result<()> {
    let invoice = &mut ctx.accounts.invoice_account;
    let org_config = &ctx.accounts.org_config;

    require!(
        invoice.status == InvoiceStatus::Validated,
        InvoiceError::InvalidStatus
    );

    require!(
        invoice.amount <= org_config.per_invoice_cap,
        InvoiceError::CapExceeded
    );

    invoice.status = InvoiceStatus::Validated;
    invoice.exit(&crate::ID)?;

    commit_accounts(
        &ctx.accounts.payer,
        vec![&ctx.accounts.invoice_account.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    Ok(())
}
