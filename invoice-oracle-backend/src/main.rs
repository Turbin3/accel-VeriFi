use std::env;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Keypair, Signer};
use solana_sdk::system_program;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::transaction::Transaction;
use regex::Regex;
use solana_client::rpc_client::RpcClient;
use std::str::FromStr;
use std::time::Duration;
use dotenvy::dotenv;
use sha2::{Digest, Sha256};
use std::fmt::Write as _;

#[derive(Clone, Debug)]
pub struct InvoiceRequest {
    pub authority: Pubkey,
    pub ipfs_hash: String,
    pub status: RequestStatus,
    pub timestamp: i64,
    pub amount: u64,
}

impl InvoiceRequest {
    pub fn from_account_data(data: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        if data.len() < 8 {
            return Err("Data too short".into());
        }

        let mut offset = 8;

        // Read authority (32 bytes)
        if offset + 32 > data.len() {
            return Err("Not enough data for authority".into());
        }
        let authority = Pubkey::try_from(&data[offset..offset + 32])?;
        offset += 32;

        // Read string length (4 bytes)
        if offset + 4 > data.len() {
            return Err("Not enough data for string length".into());
        }
        let str_len = u32::from_le_bytes([
            data[offset], data[offset + 1], data[offset + 2], data[offset + 3]
        ]) as usize;
        offset += 4;

        // Read string data
        if offset + str_len > data.len() {
            return Err("Not enough data for string".into());
        }
        let ipfs_hash = String::from_utf8(data[offset..offset + str_len].to_vec())?;
        offset += str_len;

        // Read status (1 byte)
        if offset >= data.len() {
            return Err("Not enough data for status".into());
        }
        let status = if data[offset] == 0 {
            RequestStatus::Pending
        } else {
            RequestStatus::Completed
        };
        offset += 1;

        // Read timestamp (8 bytes)
        if offset + 8 > data.len() {
            return Err("Not enough data for timestamp".into());
        }
        let timestamp = i64::from_le_bytes([
            data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
            data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]
        ]);
        offset +=8;

        // Read amount (8 bytes)
        if offset + 8 > data.len() {
            return Err("Not enough data for amount".into());
        }
        let amount = u64::from_le_bytes([
            data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
            data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]
        ]);

        Ok(InvoiceRequest {
            authority,
            ipfs_hash,
            status,
            timestamp,
            amount
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RequestStatus {
    Pending,
    Completed,
}

const PROGRAM_ID: &str = "92icJAeAhsB1fPyoURiaC53pizWW5Kv7NU5X87WdRLBB";
const RPC_URL: &str = "https://api.devnet.solana.com";

#[tokio::main]
async fn main() {
    println!("Invoice Oracle Backend Starting...");
    dotenv().ok();
    let keypair = read_keypair_file("oracle-keypair.json") //Add your keypair
        .expect("Failed to read keypair file");

    println!("Oracle wallet: {}", keypair.pubkey());

    let program_id = Pubkey::from_str(PROGRAM_ID).unwrap();
    let rpc_client = RpcClient::new(RPC_URL.to_string());

    println!("Watching program: {}", program_id);
    println!("Polling every 5 seconds...\n");

    let mut poll_count = 0;

    loop {
        poll_count += 1;
        println!("Poll #{} - Checking for new requests...", poll_count);

        match process_pending_requests(&rpc_client, &keypair, &program_id).await {
            Ok(processed) => {
                if processed > 0 {
                    println!("Processed {} requests", processed);
                } else {
                    println!("No pending requests found");
                }
            }
            Err(e) => {
                eprintln!("Error: {}", e);
            }
        }

        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

async fn process_pending_requests(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    program_id: &Pubkey,
) -> Result<usize, Box<dyn std::error::Error>> {
    println!("Fetching program accounts...");
    // We probably need more filtration here
    let accounts = rpc_client.get_program_accounts(program_id)?;

    println!("Found {} total accounts for this program", accounts.len());

    let mut processed = 0;

    // Precompute Anchor account discriminator for InvoiceRequest
    let mut h = Sha256::new();
    h.update(b"account:InvoiceRequest");
    let invoice_request_disc: [u8; 8] = h.finalize()[..8].try_into().unwrap();

    for (pubkey, account) in accounts {
        println!("Checking account: {}", pubkey);
        println!("Data length: {} bytes", account.data.len());

        if account.data.len() < 8 {
            println!("Account too small, skipping");
            continue;
        }

        let disc = &account.data[..8];
        println!("Discriminator: {:?}", disc);

        // Only consider InvoiceRequest accounts
        if disc != &invoice_request_disc {
            println!("Not an InvoiceRequest account, skipping");
            continue;
        }

        match InvoiceRequest::from_account_data(&account.data) {
            Ok(request) => {
                println!("Successfully deserialized");
                println!("Authority: {}", request.authority);
                println!("IPFS: {}", request.ipfs_hash);
                println!("Status: {:?}", request.status);

                // Explicit amount logging in base units (pre-OCR placeholder value on the request)
                let decimals: u8 = env::var("MINT_DECIMALS").ok().and_then(|s| s.parse().ok()).unwrap_or(6);
                log_amount("Request amount (pre-OCR placeholder)", request.amount, decimals);

                if matches!(request.status, RequestStatus::Pending) {
                    println!("\nFound PENDING request!");

                    match extract_and_submit(rpc_client, keypair, program_id, &request, &pubkey).await {
                        Ok(_) => {
                            println!("Successfully processed!");
                            processed += 1;
                        }
                        Err(e) => {
                            eprintln!("Failed: {}", e);
                        }
                    }
                } else {
                    println!("Already completed, skipping");
                }
            }
            Err(e) => {
                println!("Failed to deserialize InvoiceRequest: {}", e);
            }
        }
    }

    // Additionally check the org authority's request PDA when scanning (useful in development/testing).
    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY").unwrap_or_default();
    if !org_authority_str.is_empty() {
        if let Ok(org_auth) = Pubkey::from_str(&org_authority_str) {
            let (req_pda, _) = Pubkey::find_program_address(&[b"request", org_auth.as_ref()], program_id);
            if let Ok(acc) = rpc_client.get_account(&req_pda) {
                if acc.data.len() >= 8 {
                    let disc = &acc.data[..8];
                    // Expected discriminator (debug)
                    let mut h2 = Sha256::new();
                    h2.update(b"account:InvoiceRequest");
                    let expected: [u8; 8] = h2.finalize()[..8].try_into().unwrap();
                    println!("Direct PDA check: {} disc={:?} expected={:?}", req_pda, disc, expected);

                    if disc == &expected {
                        match InvoiceRequest::from_account_data(&acc.data) {
                            Ok(request) => {
                                if matches!(request.status, RequestStatus::Pending) {
                                    println!("Found PENDING request via direct PDA: {}", req_pda);
                                    extract_and_submit(rpc_client, keypair, program_id, &request, &req_pda).await?;
                                    processed += 1;
                                } else {
                                    println!("Direct PDA request is not pending (status {:?})", request.status);
                                }
                            }
                            Err(e) => println!("Failed to decode direct PDA request: {}", e),
                        }
                    }
                }
            }
        }
    }

    Ok(processed)
}

async fn extract_and_submit(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    program_id: &Pubkey,
    request: &InvoiceRequest,
    request_pubkey: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {

    let api_key = env::var("OCR_API_KEY")
        .expect("OCR_API_KEY must be set in .env file");


    let ocr_url = format!(
        "https://api.ocr.space/parse/imageurl?apikey={}&url=https://emerald-abundant-baboon-978.mypinata.cloud/ipfs/{}&language=eng&OCREngine=2",
        api_key,
        request.ipfs_hash
    );

    println!("Calling OCR API...");
    let client = reqwest::Client::new();
    let response = client.get(&ocr_url).send().await?;
    let json: serde_json::Value = response.json().await?;


    println!("\n===== RAW OCR API RESPONSE =====");
    println!("{}", serde_json::to_string_pretty(&json)?);
    println!("================================\n");



    let ocr_text = json["ParsedResults"][0]["ParsedText"]
        .as_str()
        .ok_or("Failed to extract OCR text")?;
    println!("OCR Text extracted");

    let (vendor, amount, mut due_date) = parse_invoice(ocr_text);
    println!("Vendor: {}", vendor);
    // Amount logging with base units + humanized form
    let decimals: u8 = env::var("MINT_DECIMALS").ok().and_then(|s| s.parse().ok()).unwrap_or(6);
    log_amount("Parsed amount", amount, decimals);

    if amount == 0 {
        eprintln!("Warning: parsed amount_base_units is 0; check OCR and parsing rules");
    }
    println!("Due Date: {}", due_date);

    // Ensure due date is in the future so on-chain checks pass
    let now = chrono::Utc::now().timestamp();
    // Optional testing override: set SHORT_DUE_SECONDS (seconds) in env
    let short_due_seconds = env::var("SHORT_DUE_SECONDS")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    if short_due_seconds > 0 {
        let override_due = now + short_due_seconds;
        println!(
            "SHORT_DUE_SECONDS set ({}s); overriding due date to {}",
            short_due_seconds, override_due
        );
        due_date = override_due;
    } else if due_date <= now {
        // fallback: 30 days from now
        let fallback = now + 30 * 24 * 60 * 60;
        println!(
            "Due date not found or in past; using fallback {} (30 days ahead)",
            fallback
        );
        due_date = fallback;
    }

    // Derive PDAs used by process_extraction_result
    let (invoice_pda, _) = Pubkey::find_program_address(
        &[b"invoice", request.authority.as_ref()],
        program_id,
    );

    // org_config PDA is derived from the ORG AUTHORITY (not the payer)
    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")
        .expect("ORG_AUTHORITY_PUBKEY must be set in .env");
    let org_authority = Pubkey::from_str(&org_authority_str)?;
    let (org_config_pda, _) = Pubkey::find_program_address(
        &[b"org_config", org_authority.as_ref()],
        program_id,
    );

    // Vendor PDA depends on org_config and parsed vendor name
    let (vendor_pda, _) = Pubkey::find_program_address(
        &[b"vendor", org_config_pda.as_ref(), vendor.as_bytes()],
        program_id,
    );

    // Compute Anchor discriminator dynamically: sha256("global:process_extraction_result")[..8]
    let mut hasher = Sha256::new();
    hasher.update(b"global:process_extraction_result");
    let disc: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
    let mut data = disc.to_vec();

    data.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    data.extend_from_slice(vendor.as_bytes());
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&due_date.to_le_bytes());

    // Accounts must match ProcessResult in on-chain program (order matters):
    // payer (signer), org_config (mut), vendor_account (readonly),
    // invoice_request (mut), invoice_account (init, mut), system_program
    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            // payer must be signer and writable
            AccountMeta::new(keypair.pubkey(), true),
            AccountMeta::new(org_config_pda, false),
            AccountMeta::new_readonly(vendor_pda, false),
            AccountMeta::new(*request_pubkey, false),
            AccountMeta::new(invoice_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    println!("Submitting to Solana...");
    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&keypair.pubkey()),
        &[keypair],
        recent_blockhash,
    );

    let signature = rpc_client.send_and_confirm_transaction(&tx)?;
    println!("Transaction: {}", signature);

    // Post-submit verification: fetch on-chain invoice account and log its amount
    if let Ok(acc) = rpc_client.get_account(&invoice_pda) {
        if let Ok(inv) = InvoiceAccountLite::from_account_data(&acc.data) {
            log_amount("On-chain invoice.amount", inv.amount, decimals);
        } else {
            eprintln!("Note: could not decode on-chain InvoiceAccount for post-submit verification");
        }
    } else {
        eprintln!("Note: could not fetch on-chain InvoiceAccount for post-submit verification");
    }

    // Optionally auto-request VRF after successful validation
    if env::var("AUTO_REQUEST_VRF").unwrap_or_default() == "1" {
        if let Err(e) = request_vrf_for_invoice(rpc_client, keypair, program_id, &invoice_pda).await {
            eprintln!("VRF request failed: {}", e);
        }
    }

    Ok(())
}

fn parse_invoice(text: &str) -> (String, u64, i64) {
    println!("\n===== PARSING INVOICE DATA =====");

    // Extract vendor name - look for "Bill to" followed by name on next line
    let vendor = if let Some(bill_to_pos) = text.find("Bill to") {
        // Get text after "Bill to"
        let after_bill_to = &text[bill_to_pos + 7..];

        // Split by newlines and get the first non-empty line
        let lines: Vec<&str> = after_bill_to.lines().collect();

        // The name should be on the next line after "Bill to"
        lines.iter()
            .skip(1) // Skip the "Bill to" line itself
            .find(|line| !line.trim().is_empty() && !line.contains("@")) // Skip empty lines and email
            .map(|line| line.trim().to_string())
            .unwrap_or_else(|| "Unknown Vendor".to_string())
    } else {
        // Fallback: Look for a capitalized name pattern
        let name_re = Regex::new(r"([A-Z][a-z]+\s+[A-Z][a-z]+)").unwrap();
        name_re.find(text)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "Unknown Vendor".to_string())
    };

    println!("  Vendor Name: '{}'", vendor);

    // Extract amount - look for $XX.XX followed by "due"
    let amount_re = Regex::new(r"\$([0-9]+\.[0-9]{2})\s+due").unwrap();
    let amount_str = amount_re
        .captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or("0.00");
    let amount_float: f64 = amount_str.parse().unwrap_or(0.0);
    let amount = (amount_float * 1_000_000.0) as u64;

    println!("  Amount (OCR extracted string): {}", amount_str);
    
    // Extract due date
    let date_re = Regex::new(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})").unwrap();
    let due_date = if let Some(caps) = date_re.captures(text) {
        let month = match &caps[1] {
            "January" => 1, "February" => 2, "March" => 3, "April" => 4,
            "May" => 5, "June" => 6, "July" => 7, "August" => 8,
            "September" => 9, "October" => 10, "November" => 11, "December" => 12,
            _ => 1,
        };
        let day: u32 = caps[2].parse().unwrap_or(1);
        let year: i32 = caps[3].parse().unwrap_or(2025);

        chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .map(|dt| dt.and_utc().timestamp())
            .unwrap_or(0)
    } else {
        0
    };

    if due_date > 0 {
        let date_str = chrono::NaiveDateTime::from_timestamp_opt(due_date, 0)
            .map(|dt| dt.format("%B %d, %Y").to_string())
            .unwrap_or_else(|| "Invalid".to_string());
        println!("  Due Date: {} (Unix: {})", date_str, due_date);
    } else {
        println!("  Due Date: Not found");
    }

    println!("================================\n");

    (vendor, amount, due_date)
}

fn log_amount(label: &str, amount_base_units: u64, decimals: u8) {
    // Base units as string
    let base_units_str = amount_base_units.to_string();

    // LE & BE hex (from the same u64)
    let le_hex = {
        let mut s = String::with_capacity(16);
        for b in amount_base_units.to_le_bytes() {
            let _ = write!(&mut s, "{:02x}", b);
        }
        s
    };
    let be_hex = {
        let mut s = String::with_capacity(16);
        for b in amount_base_units.to_be_bytes() {
            let _ = write!(&mut s, "{:02x}", b);
        }
        s
    };

    // Exact human string via integer math (no f64)
    let denom = 10_u128.pow(decimals as u32);
    let base = amount_base_units as u128;
    let ui_int = base / denom;
    let ui_frac = base % denom;
    let human_exact = format!(
        "{}.{}",
        ui_int,
        format!("{:0width$}", ui_frac, width = decimals as usize)
    );

    println!(
        "{} => amount_base_units: {}, le_hex: 0x{}, be_hex: 0x{}, decimals: {}, human_value: {}",
        label, base_units_str, le_hex, be_hex, decimals, human_exact
    );
}

// Minimal decoder for InvoiceAccount to read `amount` after variable-length vendor_name
#[derive(Clone, Debug)]
struct InvoiceAccountLite {
    pub amount: u64,
}

impl InvoiceAccountLite {
    pub fn from_account_data(data: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        // Anchor account discriminator (8 bytes) + fields
        let mut offset = 8;

        // authority (32)
        if offset + 32 > data.len() { return Err("InvoiceAccount: short read (authority)".into()); }
        offset += 32;

        // vendor (32)
        if offset + 32 > data.len() { return Err("InvoiceAccount: short read (vendor)".into()); }
        offset += 32;

        // vendor_name length (4) + bytes
        if offset + 4 > data.len() { return Err("InvoiceAccount: short read (vendor_name len)".into()); }
        let name_len = u32::from_le_bytes([
            data[offset], data[offset+1], data[offset+2], data[offset+3]
        ]) as usize;
        offset += 4;
        if offset + name_len > data.len() { return Err("InvoiceAccount: short read (vendor_name)".into()); }
        offset += name_len;

        // amount (u64)
        if offset + 8 > data.len() { return Err("InvoiceAccount: short read (amount)".into()); }
        let amount = u64::from_le_bytes([
            data[offset], data[offset+1], data[offset+2], data[offset+3],
            data[offset+4], data[offset+5], data[offset+6], data[offset+7]
        ]);

        Ok(InvoiceAccountLite { amount })
    }
}

// Send our program's request_invoice_audit_vrf instruction
async fn request_vrf_for_invoice(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    program_id: &Pubkey,
    invoice_pda: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    // Derive org_config PDA from ORG_AUTHORITY_PUBKEY
    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")
        .expect("ORG_AUTHORITY_PUBKEY must be set in .env");
    let org_authority = Pubkey::from_str(&org_authority_str)?;
    let (org_config_pda, _) = Pubkey::find_program_address(
        &[b"org_config", org_authority.as_ref()],
        program_id,
    );

    // Oracle queue pubkey must match on-chain DEFAULT_QUEUE constant
    let queue_str = env::var("QUEUE_PUBKEY")
        .expect("QUEUE_PUBKEY must be set in .env to auto-request VRF");
    let queue_pk = Pubkey::from_str(&queue_str)?;

    // Discriminator for global:request_invoice_audit_vrf
    let mut h = Sha256::new();
    h.update(b"global:request_invoice_audit_vrf");
    let disc: [u8; 8] = h.finalize()[..8].try_into().unwrap();

    // Single u8 client_seed argument; use a simple deterministic seed
    let client_seed: u8 = 42;

    let mut data = Vec::with_capacity(9);
    data.extend_from_slice(&disc);
    data.push(client_seed);

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),       // payer (signer, mut)
            AccountMeta::new(org_config_pda, false),        // org_config (mut)
            AccountMeta::new(*invoice_pda, false),          // invoice_account (mut)
            AccountMeta::new(queue_pk, false),              // oracle_queue (mut)
        ],
        data,
    };

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&keypair.pubkey()),
        &[keypair],
        recent_blockhash,
    );

    let sig = rpc_client.send_and_confirm_transaction(&tx)?;
    println!("VRF requested for invoice {}. Tx: {}", invoice_pda, sig);
    Ok(())
}
