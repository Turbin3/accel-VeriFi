#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::{commit,delegate,ephemeral}, cpi::DelegateConfig};

declare_id!("CwD9tU4A7c7SS5b55ZtTcEPGA8svJQUhfdCbdoaSF1Tx");

pub const CALLBACK_VRF_DISCRIMINATOR: [u8; 7] = *b"clbrand"; 
mod state;
mod instructions;

use crate::instructions::*;
use crate::state::*;

#[program]
#[ephemeral]
pub mod invoice_claim {
    use super::*;

    // Invoice request + OCR fulfillment
    pub fn request_invoice_extraction(ctx: Context<RequestExtraction>, ipfs_hash: String, amount: u64) -> Result<()> {
        instructions::invoice::request_invoice_extraction(ctx, ipfs_hash,amount)
    }

    pub fn process_extraction_result(
        ctx: Context<ProcessResult>,
        vendor_name: String,
        amount: u64,
        due_date: i64,
    ) -> Result<()> {
        instructions::invoice::process_extraction_result(ctx, vendor_name, amount, due_date)
    }

    pub fn request_invoice_audit_vrf(ctx: Context<RequestInvoiceAuditVrf>, client_seed: u8) -> Result<()> {
        instructions::vrf::request_invoice_audit_vrf(ctx, client_seed)
    }

    #[instruction(discriminator = &CALLBACK_VRF_DISCRIMINATOR)]
    pub fn callback_invoice_vrf(ctx: Context<CallbackInvoiceVrf>, randomness: [u8; 32]) -> Result<()> {
        instructions::vrf::callback_invoice_vrf(ctx, randomness)
    }

    // Status-only payment flow
    pub fn process_invoice_payment(ctx: Context<ProcessPayment>) -> Result<()> {
        instructions::payments::process_invoice_payment(ctx)
    }

    pub fn complete_payment(ctx: Context<CompletePayment>) -> Result<()> {
        instructions::payments::complete_payment(ctx)
    }

    // Close accounts
    pub fn close_invoice(ctx: Context<CloseInvoice>) -> Result<()> {
        instructions::close::close_invoice(ctx)
    }

    pub fn close_request(ctx: Context<CloseRequest>) -> Result<()> {
        instructions::close::close_request(ctx)
    }

    // Manual review decision after VRF selects invoice for audit
    pub fn audit_decide(ctx: Context<AuditDecide>, approve: bool) -> Result<()> {
        instructions::invoice::audit_decide(ctx, approve)
    }

    // Org config
    pub fn org_init(
        ctx: Context<OrgInit>,
        treasury_vault: Pubkey,
        mint: Pubkey,
        per_invoice_cap: u64,
        daily_cap: u64,
        audit_rate_bps: u16,
    ) -> Result<()> {
        instructions::org::org_init(ctx, treasury_vault, mint, per_invoice_cap, daily_cap, audit_rate_bps)
    }

    // Update Org Config
    pub fn update_org_config(ctx: Context<UpdateOrgConfig>, update_args: UpdateOrgConfigArgs) -> Result<()> {
        instructions::org::update_org_config(ctx, update_args)
    }

    // Escrow MVP
    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        instructions::escrow::fund_escrow(ctx)
    }

    pub fn settle_to_vendor(ctx: Context<SettleToVendor>) -> Result<()> {
        instructions::escrow::settle_to_vendor(ctx)
    }

    //Vendor Management
    pub fn register_vendor(
        ctx: Context<RegisterVendor>,
        vendor_name: String,
        wallet: Pubkey,
    ) -> Result<()> {
        instructions::vendor::register_vendor(ctx, vendor_name, wallet)
    }

    pub fn deactivate_vendor(ctx: Context<ManageVendor>) -> Result<()> {
        instructions::vendor::deactivate_vendor(ctx)
    }

    pub fn activate_vendor(ctx: Context<ManageVendor>) -> Result<()> {
        instructions::vendor::activate_vendor(ctx)
    }

    pub fn update_vendor_wallet(ctx: Context<ManageVendor>, new_wallet: Pubkey) -> Result<()> {
        instructions::vendor::update_vendor_wallet(ctx, new_wallet)
    }

    pub fn delegate_invoice_extraction(ctx: Context<DelegateExtraction>) -> Result<()> {
        // no need to pass seeds again because the macro knows them
        ctx.accounts.delegate_invoice_request(
            &ctx.accounts.authority,
            &[],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn commit_invoice_extraction(
        ctx: Context<CommitInvoice>,
        extracted_amount: u64,
        extracted_vendor: Pubkey,
    ) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice_request;
        invoice.amount = extracted_amount;
        invoice.authority = extracted_vendor;
        invoice.status = RequestStatus::Completed;

        Ok(())
    }
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateExtraction<'info> {
    // NOTE: use the same seeds used when creating invoice_request
    #[account(mut, del, seeds = [b"request", authority.key().as_ref()], bump)]
    pub invoice_request: Account<'info, InvoiceRequest>,

    #[account(mut)]
    pub authority: Signer<'info>, // must be the same authority used when creating the request

    pub system_program: Program<'info, System>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitInvoice<'info> {
    #[account(mut)]
    pub invoice_request: Account<'info, InvoiceRequest>,

    pub system_program: Program<'info, System>,
}
