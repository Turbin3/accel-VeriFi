use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct InitPaymentQueue<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"org_config", org_config.authority.as_ref()],
        bump = org_config.bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + PaymentQueue::INIT_SPACE,
        seeds = [b"payment_queue", org_config.key().as_ref()],
        bump
    )]
    pub payment_queue: Account<'info, PaymentQueue>,

    pub system_program: Program<'info, System>,
}

pub fn init_payment_queue(ctx: Context<InitPaymentQueue>) -> Result<()> {
    let queue = &mut ctx.accounts.payment_queue;
    queue.org = ctx.accounts.org_config.key();
    queue.pending_invoices = Vec::new();
    queue.count = 0;
    queue.last_updated = Clock::get()?.unix_timestamp;
    queue.bump = ctx.bumps.payment_queue;

    msg!("PaymentQueue initialized for org: {}", queue.org);
    Ok(())
}

// Called when invoice reaches InEscrowReadyToSettle status
#[derive(Accounts)]
pub struct AddToPaymentQueue<'info> {
    #[account(
        mut,
        seeds = [b"org_config", org_config.authority.as_ref()],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        seeds = [b"invoice", invoice_account.authority.as_ref(), &invoice_account.nonce.to_le_bytes()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    #[account(
        mut,
        seeds = [b"payment_queue", org_config.key().as_ref()],
        bump
    )]
    pub payment_queue: Account<'info, PaymentQueue>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_payment_queue(ctx: Context<AddToPaymentQueue>) -> Result<()> {
    let invoice = &ctx.accounts.invoice_account;
    let queue = &mut ctx.accounts.payment_queue;

    // Only add invoices ready for settlement
    // require!(
    //     invoice.status == InvoiceStatus::InEscrowReadyToSettle,
    //     InvoiceError::InvalidStatus
    // );

    // Prevent duplicates
    require!(
        !queue.pending_invoices.iter().any(|p| p.invoice_account == invoice.key()),
        InvoiceError::InvalidStatus // or create custom error
    );

    let payment = PendingPayment {
        invoice_account: invoice.key(),
        vendor: invoice.vendor,
        due_date: invoice.due_date,
        amount: invoice.amount,
    };

    queue.pending_invoices.push(payment);
    queue.count += 1;
    queue.last_updated = Clock::get()?.unix_timestamp;

    msg!("Added invoice to payment queue: {}", invoice.key());
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveFromPaymentQueue<'info> {
    #[account(
        mut,
        seeds = [b"org_config", org_config.authority.as_ref()],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        mut,
        seeds = [b"payment_queue", org_config.key().as_ref()],
        bump
    )]
    pub payment_queue: Account<'info, PaymentQueue>,

    pub system_program: Program<'info, System>,
}

pub fn remove_from_payment_queue(
    ctx: Context<RemoveFromPaymentQueue>,
    invoice_key: Pubkey,
) -> Result<()> {
    let queue = &mut ctx.accounts.payment_queue;

    let initial_len = queue.pending_invoices.len();
    queue.pending_invoices.retain(|p| p.invoice_account != invoice_key);

    require!(
        queue.pending_invoices.len() < initial_len,
        InvoiceError::InvalidStatus // Invoice not found in queue
    );

    queue.count = queue.pending_invoices.len() as u64;
    queue.last_updated = Clock::get()?.unix_timestamp;

    msg!("Removed invoice from payment queue: {}", invoice_key);
    Ok(())
}
