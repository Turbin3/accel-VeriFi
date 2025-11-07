use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;
use crate::CALLBACK_VRF_DISCRIMINATOR;
use crate::state::*;

/// STEP 1: Request randomness to decide if invoice should be audited
pub fn request_invoice_audit_vrf(ctx: Context<RequestInvoiceAuditVrf>, client_seed: u8) -> Result<()> {
    let invoice = &ctx.accounts.invoice_account;

    require!(
        invoice.status == InvoiceStatus::InEscrowAwaitingVRF,
        InvoiceError::InvalidStatus
    );

    msg!(
        "Requesting VRF randomness for invoice: {} | vendor: {}",
        invoice.key(),
        invoice.vendor_name
    );

    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.payer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: CALLBACK_VRF_DISCRIMINATOR.to_vec(),
        caller_seed: [client_seed; 32],
        accounts_metas: Some(vec![
            SerializableAccountMeta {
                pubkey: ctx.accounts.invoice_account.key(),
                is_signer: false,
                is_writable: true,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.org_config.key(),
                is_signer: false,
                is_writable: false,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.payment_queue.key(),
                is_signer: false,
                is_writable: true,
            },
        ]),
        ..Default::default()
    });

    // Dispatch request to oracle
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

    msg!("VRF randomness request sent.");
    Ok(())
}

/// STEP 2: Callback once randomness is ready
pub fn callback_invoice_vrf(ctx: Context<CallbackInvoiceVrf>, randomness: [u8; 32]) -> Result<()> {
    msg!("Received VRF callback | deciding audit outcome...");

    let invoice = &mut ctx.accounts.invoice_account;
    let org_config = &ctx.accounts.org_config;
    let payment_queue = &mut ctx.accounts.payment_queue;

    // Only apply VRF outcome immediately after validation.
    // Prevents late/duplicate callbacks from overriding post-VRF states.
    // After escrow is funded, VRF decides audit outcome while funds remain locked
    require!(
        invoice.status == InvoiceStatus::InEscrowAwaitingVRF,
        InvoiceError::InvalidStatus
    );

    // Convert bytes → number
    let random_value = u64::from_le_bytes(randomness[..8].try_into().unwrap());
    let threshold = org_config.audit_rate_bps as u64;

    // 10000 = 100% in basis points
    let audit_selected = random_value % 10_000 < threshold;

    // Update status
    invoice.status = if audit_selected {
        InvoiceStatus::InEscrowAuditPending
    } else {
        InvoiceStatus::InEscrowReadyToSettle
    };

    // AUTO-ADD to PaymentQueue when invoice is approved for settlement
    if !audit_selected {
        // Check if already in queue to prevent duplicates
        let already_queued = payment_queue
            .pending_invoices
            .iter()
            .any(|p| p.invoice_account == invoice.key());

        require!(!already_queued, InvoiceError::InvalidStatus);

        let pending_payment = PendingPayment {
            invoice_account: invoice.key(),
            vendor: invoice.vendor,
            due_date: invoice.due_date,
            amount: invoice.amount,
        };

        payment_queue.pending_invoices.push(pending_payment);
        payment_queue.count += 1;
        payment_queue.last_updated = Clock::get()?.unix_timestamp;

        msg!("Invoice added to PaymentQueue: {}", invoice.key());
    }

    msg!(
        "Invoice {} | Audit Selected: {} | Random Value: {} | Threshold: {} bps",
        invoice.vendor_name,
        audit_selected,
        random_value,
        threshold
    );
    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct RequestInvoiceAuditVrf<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

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

    #[account(
        mut,
        seeds = [b"payment_queue", org_config.key().as_ref()],
        bump
    )]
    pub payment_queue: Account<'info, PaymentQueue>,

    /// CHECK: Oracle queue reference
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CallbackInvoiceVrf<'info> {
    /// CHECK: VRF program identity (no signature during CPI). The address
    /// constraint ensures the caller is the VRF program identity.
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: UncheckedAccount<'info>,

    // Must match the order provided in `accounts_metas` when the request was made
    // 1) invoice_account (writable)
    #[account(mut)]
    pub invoice_account: Account<'info, InvoiceAccount>,

    // 2) org_config (readonly)
    pub org_config: Account<'info, OrgConfig>,

    // 3) payment_queue (writable) - NEW
    #[account(
        mut,
        seeds = [b"payment_queue", org_config.key().as_ref()],
        bump
    )]
    pub payment_queue: Account<'info, PaymentQueue>,
}
