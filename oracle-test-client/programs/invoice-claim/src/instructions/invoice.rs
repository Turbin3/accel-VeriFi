use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(ipfs_hash: String)]
pub struct RequestExtraction<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + InvoiceRequest::INIT_SPACE,
        seeds = [b"request", authority.key().as_ref()],
        bump
    )]
    pub invoice_request: Account<'info, InvoiceRequest>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn request_invoice_extraction(
    ctx: Context<RequestExtraction>,
    ipfs_hash: String,
    amount: u64
) -> Result<()> {
    require!(!ipfs_hash.is_empty(), InvoiceError::InvalidIPFSHash);
    require!(amount > 0, InvoiceError::InvalidAmount);

    ctx.accounts.invoice_request.set_inner(InvoiceRequest{
        authority: ctx.accounts.authority.key(),
        ipfs_hash: ipfs_hash.clone(),
        status: RequestStatus::Pending,
        timestamp: Clock::get()?.unix_timestamp,
        amount
    });

    msg!("Invoice extraction requested for IPFS: {}", ipfs_hash);
    Ok(())
}

#[derive(Accounts)]
#[instruction(vendor_name: String)]  //needed for vendor PDA derivation
pub struct ProcessResult<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // OrgConfig for oracle authorization and invoice counter
    #[account(
        mut,
        seeds = [b"org_config", org_config.authority.as_ref()],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    // VendorAccount to validate vendor is registered and active
    #[account(
        seeds = [b"vendor", org_config.key().as_ref(), vendor_name.as_bytes()],
        bump
    )]
    pub vendor_account: Account<'info, VendorAccount>,

    #[account(
        mut,
        seeds = [b"request", invoice_request.authority.as_ref()],
        bump
    )]
    pub invoice_request: Account<'info, InvoiceRequest>,

    #[account(
        init,
        payer = payer,
        space = 8 + InvoiceAccount::INIT_SPACE,
        seeds = [b"invoice", invoice_request.authority.as_ref()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,

    pub system_program: Program<'info, System>,
}

pub fn process_extraction_result(
    ctx: Context<ProcessResult>,
    vendor_name: String,
    amount: u64,
    due_date: i64,
) -> Result<()> {

    let org_config = &mut ctx.accounts.org_config;

    // Only the configured oracle_signer may submit; this can complicate test setup.
    require_keys_eq!(
        ctx.accounts.payer.key(),
        org_config.oracle_signer,
        InvoiceError::Unauthorized
    );

    // Validate extracted data
    require!(amount > 0, InvoiceError::InvalidAmount);
    require!(amount <= org_config.per_invoice_cap, InvoiceError::CapExceeded);
    require!(!vendor_name.is_empty(), InvoiceError::InvalidVendor);
    require!(vendor_name.len() <= 50, InvoiceError::InvalidVendor);

    let current_time = Clock::get()?.unix_timestamp;
    require!(due_date > current_time, InvoiceError::InvalidDueDate);

    // Verify vendor is registered and active (CRITICAL for whitelist)
    let vendor = &ctx.accounts.vendor_account;
    require!(vendor.is_active, InvoiceError::VendorInactive);
    require_keys_eq!(vendor.org, org_config.key(), InvoiceError::WrongOrg);
    let invoice = &mut ctx.accounts.invoice_account;
    let request = &mut ctx.accounts.invoice_request;

    invoice.set_inner(InvoiceAccount{
        authority: request.authority,
        vendor_name,
        amount,
        due_date,
        ipfs_hash: request.ipfs_hash.clone(),
        status: InvoiceStatus::Validated,
        timestamp: Clock::get()?.unix_timestamp,
        vendor: ctx.accounts.vendor_account.key(),
    });

    request.status = RequestStatus::Completed;
    msg!("Invoice processed: {} - ${}", invoice.vendor_name, invoice.amount);
    Ok(())
}
// Manual review decision after VRF selects the invoice for audit
#[derive(Accounts)]
pub struct AuditDecide<'info> {
    #[account(mut)]
    pub reviewer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"org_config", org_config.authority.as_ref()],
        bump
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(
        mut,
        seeds = [b"invoice", invoice_account.authority.as_ref()],
        bump
    )]
    pub invoice_account: Account<'info, InvoiceAccount>,
}

pub fn audit_decide(ctx: Context<AuditDecide>, approve: bool) -> Result<()> {
    let org = &ctx.accounts.org_config;
    // Only org authority or oracle signer can decide
    require!(
        ctx.accounts.reviewer.key() == org.authority || ctx.accounts.reviewer.key() == org.oracle_signer,
        InvoiceError::Unauthorized
    );

    let invoice = &mut ctx.accounts.invoice_account;
    require!(invoice.status == InvoiceStatus::InEscrowAuditPending, InvoiceError::InvalidStatus);

    invoice.status = if approve {
        InvoiceStatus::InEscrowReadyToSettle
    } else {
        InvoiceStatus::Refunded
    };

    Ok(())
}
