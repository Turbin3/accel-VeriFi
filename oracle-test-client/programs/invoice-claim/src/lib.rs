#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::{commit,delegate,ephemeral}, cpi::DelegateConfig};
declare_id!("DVxvMr8TyPWpnT4tQc56SCLXAiNr2VC4w22R6i7B1V9U");

pub const CALLBACK_VRF_DISCRIMINATOR: [u8; 7] = *b"clbrand";
mod state;
mod instructions;

use crate::state::*;
use crate::instructions::*;

#[ephemeral]
#[program]
pub mod invoice_claim {
    use super::*;

    // Invoice request + OCR fulfillment
    pub fn request_invoice_extraction(
        ctx: Context<RequestExtraction>,
        ipfs_hash: String,
        amount: u64,
    ) -> Result<()> {
        instructions::invoice::request_invoice_extraction(ctx, ipfs_hash, amount)
    }

    // Submitting the extracted invoice data
    pub fn submit_extraction_result(
        ctx: Context<SubmitExtraction>,
        vendor_name: String,
        extracted_amount: u64,
        due_date: i64,
    ) -> Result<()> {
        instructions::invoice::submit_extraction_result(
            ctx,
            vendor_name,
            extracted_amount,
            due_date,
        )
    }

    // Delegating the invoice to the Magicblock ER for private processing
    pub fn delegate_invoice_to_er(ctx: Context<DelegateInvoice>) -> Result<()> {
        msg!("Delegating invoice to MagicBlock ER for private processing");

        ctx.accounts.delegate_invoice(
            &ctx.accounts.authority,
            &[],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Funding amount and source are confidential on ER
    pub fn fund_escrow_on_er(ctx: Context<FundEscrowOnER>, amount: u64) -> Result<()> {
        instructions::escrow::fund_escrow_on_er(ctx, amount)
    }

    /// Settle to vendor (PRIVATE on ER)
    pub fn settle_to_vendor_on_er(ctx: Context<SettleOnER>) -> Result<()> {
        instructions::escrow::settle_to_vendor(ctx)
    }

    /// Validate payment (PRIVATE on ER)
    pub fn validate_payment_on_er(ctx: Context<ValidatePaymentOnER>) -> Result<()> {
        instructions::payments::validate_payment_on_er(ctx)
    }

    /// Commit and return to L1
    pub fn commit_and_return_to_l1(ctx: Context<CommitAndReturn>) -> Result<()> {
        instructions::invoice::commit_and_return_to_l1(ctx)
    }

    pub fn refund_escrow_on_er(ctx: Context<RefundEscrow>) -> Result<()> {
        instructions::escrow::refund_escrow(ctx)
    }

    pub fn request_invoice_audit_vrf(
        ctx: Context<RequestInvoiceAuditVrf>,
        client_seed: u8,
    ) -> Result<()> {
        instructions::vrf::request_invoice_audit_vrf(ctx, client_seed)
    }

    #[instruction(discriminator = &CALLBACK_VRF_DISCRIMINATOR)]
    pub fn callback_invoice_vrf(
        ctx: Context<CallbackInvoiceVrf>,
        randomness: [u8; 32],
    ) -> Result<()> {
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
        instructions::org::org_init(
            ctx,
            treasury_vault,
            mint,
            per_invoice_cap,
            daily_cap,
            audit_rate_bps,
        )
    }

    // Update Org Config
    pub fn update_org_config(
        ctx: Context<UpdateOrgConfig>,
        update_args: UpdateOrgConfigArgs,
    ) -> Result<()> {
        instructions::org::update_org_config(ctx, update_args)
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
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInvoice<'info> {
    // Delegate the invoice (which already has OCR data)
    #[account(mut, del, seeds = [b"invoice", authority.key().as_ref()], bump)]
    pub invoice: Account<'info, InvoiceAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
