use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct PaymentQueue {
    pub org: Pubkey,                    // Links to OrgConfig
    #[max_len(100)]
    pub pending_invoices: Vec<PendingPayment>,
    pub count: u64,                     // Total entries
    pub last_updated: i64,              // Last time queue was modified
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct PendingPayment {
    pub invoice_account: Pubkey,        // Reference to InvoiceAccount
    pub vendor: Pubkey,                 // Vendor pubkey (redundant but speeds up cranker)
    pub due_date: i64,                  // Due date timestamp
    pub amount: u64,                    // Invoice amount
}

#[account]
#[derive(InitSpace)]
pub struct InvoiceRequest {
    pub authority: Pubkey,
    #[max_len(64)]
    pub ipfs_hash: String,
    pub status: RequestStatus,
    pub timestamp: i64,
    pub amount: u64,
    pub nonce: u64,
}

#[account]
#[derive(InitSpace)]
pub struct InvoiceAccount {
    pub authority: Pubkey,              // Invoice owner
    pub vendor: Pubkey,                 // Links to VendorAccount
    #[max_len(50)]
    pub vendor_name: String,
    pub amount: u64,
    pub due_date: i64,
    #[max_len(64)]
    pub ipfs_hash: String,
    pub status: InvoiceStatus,
    pub timestamp: i64,
    pub nonce: u64,
}

//A singleton state that manages the full protocol
#[account]
#[derive(InitSpace)]
pub struct OrgConfig {
    pub authority: Pubkey,
    pub oracle_signer: Pubkey,
    pub treasury_vault: Pubkey,
    pub mint: Pubkey,
    pub per_invoice_cap: u64,
    pub daily_cap: u64,
    pub daily_spent: u64,               // Track daily spending
    pub last_reset_day: i64,            // Last day caps were reset
    pub audit_rate_bps: u16,            // Basis points (e.g., 500 = 5%)
    pub paused: bool,
    pub invoice_counter: u64,
    pub version: u8,
    pub bump: u8
}


#[account]
#[derive(InitSpace)]
pub struct VendorAccount {
    pub org: Pubkey,                    // Links to OrgConfig
    #[max_len(50)]
    pub vendor_name: String,            // Vendor identifier (matches invoice.vendor_name)
    pub wallet: Pubkey,                 // Where to send payments
    pub total_paid: u64,                // Lifetime payment tracking
    pub last_payment: i64,              // Unix timestamp of last payment
    pub is_active: bool,                // Can be disabled to block payments
    pub currency_preference: Pubkey,    // Preferred mint (for multi-currency)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RequestStatus {
    Pending,
    Completed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum InvoiceStatus {
    Validated,
    InEscrowAwaitingVRF,
    InEscrowAuditPending,
    InEscrowReadyToSettle,
    Paid,
    Refunded,
}

// Update Org Config Args
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct UpdateOrgConfigArgs {
    pub per_invoice_cap: Option<u64>,
    pub daily_cap: Option<u64>,
    pub paused: Option<bool>,
    pub oracle_signer: Option<Pubkey>,
    pub mint: Option<Pubkey>,
}

#[error_code]
pub enum InvoiceError {
    #[msg("Invoice status is invalid for this operation")]
    InvalidStatus,
    #[msg("Payment is overdue")]
    PaymentOverdue,
    #[msg("Payment is not yet due")]
    PaymentNotDue,
    #[msg("Organization is paused")]
    OrgPaused,
    #[msg("Per-invoice cap exceeded")]
    CapExceeded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Wrong mint for this organization")]
    WrongMint,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid vendor name")]
    InvalidVendor,
    #[msg("Vendor is not active")]
    VendorInactive,
    #[msg("Due date must be in the future")]
    InvalidDueDate,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid audit rate (must be 0-10000 bps)")]
    InvalidAuditRate,
    #[msg("Wrong organization")]
    WrongOrg,
    #[msg("Invalid wallet")]
    InvalidWallet,
    #[msg("Invalid IPFS hash")]
    InvalidIPFSHash,
}
