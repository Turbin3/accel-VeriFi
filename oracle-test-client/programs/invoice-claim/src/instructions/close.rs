use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct CloseInvoice<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"invoice", authority.key().as_ref(), &invoice_account.nonce.to_le_bytes()],
        bump,
        has_one = authority
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn close_invoice(ctx: Context<CloseInvoice>) -> Result<()> {
    let invoice = &ctx.accounts.invoice_account;
    msg!("Closing invoice account for vendor: {}", invoice.vendor_name);
    msg!("Rent returned to: {}", ctx.accounts.authority.key());
    Ok(())
}

#[derive(Accounts)]
pub struct CloseRequest<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"request", authority.key().as_ref(), &invoice_request.nonce.to_le_bytes()],
        bump,
        has_one = authority
    )]
    pub invoice_request: Account<'info, InvoiceRequest>,

    #[account(mut)]
    pub authority: Signer<'info>,
}


pub fn close_request(ctx: Context<CloseRequest>) -> Result<()> {
    let request = &ctx.accounts.invoice_request;
    msg!("Closing request account for IPFS: {}", request.ipfs_hash);
    msg!("Rent returned to: {}", ctx.accounts.authority.key());
    Ok(())
}
