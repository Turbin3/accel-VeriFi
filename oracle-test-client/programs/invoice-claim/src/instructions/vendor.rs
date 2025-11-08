use anchor_lang::prelude::*;
use crate::state::*;


#[derive(Accounts)]
#[instruction(vendor_name: String)]
pub struct RegisterVendor<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + VendorAccount::INIT_SPACE,
        seeds = [b"vendor", org_config.key().as_ref(), vendor_name.as_bytes()],
        bump
    )]
    pub vendor_account: Account<'info, VendorAccount>,

    #[account(
        has_one = authority
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_vendor(
    ctx: Context<RegisterVendor>,
    vendor_name: String,
    wallet: Pubkey,
) -> Result<()> {
    require!(!vendor_name.is_empty(), InvoiceError::InvalidVendor);
    require!(vendor_name.len() <= 50, InvoiceError::InvalidVendor);
    require!(wallet != Pubkey::default(), InvoiceError::InvalidWallet);

    ctx.accounts.vendor_account.set_inner(VendorAccount{
        org: ctx.accounts.org_config.key(),
        vendor_name: vendor_name.clone(),
        wallet,
        total_paid: 0,
        last_payment: 0,
        is_active: true,
        currency_preference: ctx.accounts.org_config.mint,
    });

    msg!("Vendor registered: {}", vendor_name);
    Ok(())
}

#[derive(Accounts)]
pub struct ManageVendor<'info> {
    #[account(
        mut,
        seeds = [b"vendor", org_config.key().as_ref(), vendor_account.vendor_name.as_bytes()],
        bump
    )]
    pub vendor_account: Account<'info, VendorAccount>,

    #[account(
        has_one = authority @ InvoiceError::Unauthorized
    )]
    pub org_config: Account<'info, OrgConfig>,

    pub authority: Signer<'info>,
}

pub fn deactivate_vendor(ctx: Context<ManageVendor>) -> Result<()> {
    let vendor = &mut ctx.accounts.vendor_account;
    require!(vendor.is_active, InvoiceError::VendorInactive);

    vendor.is_active = false;
    msg!("Vendor deactivated: {}", vendor.vendor_name);
    Ok(())
}

pub fn activate_vendor(ctx: Context<ManageVendor>) -> Result<()> {
    let vendor = &mut ctx.accounts.vendor_account;
    require!(!vendor.is_active, InvoiceError::VendorInactive);

    vendor.is_active = true;
    msg!("Vendor activated: {}", vendor.vendor_name);
    Ok(())
}

pub fn update_vendor_wallet(
    ctx: Context<ManageVendor>,
    new_wallet: Pubkey,
) -> Result<()> {
    require!(new_wallet != Pubkey::default(), InvoiceError::InvalidWallet);
    let vendor = &mut ctx.accounts.vendor_account;
    vendor.wallet = new_wallet;
    msg!("Vendor wallet updated for: {}", vendor.vendor_name);
    Ok(())
}
#[derive(Accounts)]
pub struct CloseVendor<'info> {
    #[account(
        mut,
        seeds = [b"vendor", org_config.key().as_ref(), vendor_account.vendor_name.as_bytes()],
        bump,
        close = authority, // Send rent back to authority
    )]
    pub vendor_account: Account<'info, VendorAccount>,

    #[account(
        has_one = authority @ InvoiceError::Unauthorized
    )]
    pub org_config: Account<'info, OrgConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn close_vendor(ctx: Context<CloseVendor>) -> Result<()> {
    let vendor = &ctx.accounts.vendor_account;

    // Optional: Require vendor to be deactivated before closing
    // require!(!vendor.is_active, InvoiceError::InvalidStatus);

    // Optional: Check that vendor has no outstanding payments
    // You might want to add a check here to prevent closing vendors
    // that still have pending invoices

    msg!("Vendor account closed: {}", vendor.vendor_name);
    Ok(())
}

