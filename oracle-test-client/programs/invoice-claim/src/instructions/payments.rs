use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct ProcessPayment<'info> {
    #[account(
        mut,
        seeds = [b"invoice", authority.key().as_ref()],
        bump,
        has_one = authority
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    pub authority: Signer<'info>,
}

pub fn process_invoice_payment(ctx: Context<ProcessPayment>) -> Result<()> {
    let invoice = &ctx.accounts.invoice_account;
    // Status-only path: treat as logical escrow authorization before VRF
    require!(invoice.status == InvoiceStatus::Validated, InvoiceError::InvalidStatus);

    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time <= invoice.due_date, InvoiceError::PaymentOverdue);

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
    require!(invoice.status == InvoiceStatus::InEscrowReadyToSettle, InvoiceError::InvalidStatus);
    invoice.status = InvoiceStatus::Paid;
    msg!("Payment completed for vendor: {}", invoice.vendor_name);
    Ok(())
}
