mod escrow;
mod payment_queue;
mod cranker;

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
use crate::cranker::run_cranker;
use crate::escrow::fund_escrow_for_invoice;
use crate::payment_queue::add_to_payment_queue;

#[derive(Clone, Debug)]
pub struct InvoiceRequest {
    pub authority: Pubkey,
    pub ipfs_hash: String,
    pub status: RequestStatus,
    pub timestamp: i64,
    pub amount: u64,
    pub nonce: u64,
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
        offset += 8;

        // Read amount (8 bytes)
        if offset + 8 > data.len() {
            return Err("Not enough data for amount".into());
        }
        let amount = u64::from_le_bytes([
            data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
            data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]
        ]);
        offset += 8;

        // Read nonce (u64)
        let mut nonce: u64 = 0;
        if offset + 8 <= data.len() {
            nonce = u64::from_le_bytes([
                data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
                data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]
            ]);
        }

        Ok(InvoiceRequest {
            authority,
            ipfs_hash,
            status,
            timestamp,
            amount,
            nonce,
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RequestStatus {
    Pending,
    Completed,
}

const PROGRAM_ID: &str = "HQ5y6ZMwNHSrRvma4bDHtay4UDW5qBM63A5mvyGi4MkH";
const RPC_URL: &str = "https://api.devnet.solana.com";

#[tokio::main]
async fn main() {
    println!("Invoice Oracle Backend Starting...");
    dotenv().ok();

    let keypair = read_keypair_file("phantom-keypair.json")
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
                    println!("✅ Processed {} requests", processed);
                } else {
                    println!("No pending requests found");
                }
            }
            Err(e) => {
                eprintln!("❌ Error in processing requests: {}", e);
            }
        }

        match run_cranker(&rpc_client, &keypair, &program_id) {
            Ok(_) => println!("✅ Cranker run completed successfully"),
            Err(e) => eprintln!("❌ Error in cranker run: {}", e),
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
    let accounts = rpc_client.get_program_accounts(program_id)?;
    println!("Found {} total accounts for this program", accounts.len());

    let mut processed = 0;

    let mut h = Sha256::new();
    h.update(b"account:InvoiceRequest");
    let invoice_request_disc: [u8; 8] = h.finalize()[..8].try_into().unwrap();

    for (pubkey, account) in accounts {
        println!("\n🔍 Checking account: {}", pubkey);
        println!("   Data length: {} bytes", account.data.len());

        if account.data.len() < 8 {
            println!("   ⚠️ Account too small, skipping");
            continue;
        }

        let disc = &account.data[..8];
        println!("   Discriminator: {:02x?}", disc);

        if disc != &invoice_request_disc {
            println!("   ℹ️ Not an InvoiceRequest account, skipping");
            continue;
        }

        match InvoiceRequest::from_account_data(&account.data) {
            Ok(request) => {
                println!("Successfully deserialized InvoiceRequest");
                println!("Authority: {}", request.authority);
                println!("IPFS: {}", request.ipfs_hash);
                println!("Status: {:?}", request.status);
                println!("Nonce: {}", request.nonce);

                let decimals: u8 = env::var("MINT_DECIMALS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(6);
                log_amount("Request amount", request.amount, decimals);

                if matches!(request.status, RequestStatus::Pending) {
                    println!("\nFound PENDING request!");
                    match extract_and_submit(rpc_client, keypair, program_id, &request, &pubkey).await {
                        Ok(_) => {
                            println!("Successfully processed!");
                            processed += 1;
                        }
                        Err(e) => eprintln!("Failed: {}", e),
                    }
                } else {
                    println!("Already completed, skipping");
                }
            }
            Err(e) => println!("Failed to deserialize InvoiceRequest: {}", e),
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

    let ocr_filetype = env::var("OCR_FILETYPE").unwrap_or_else(|_| "pdf".to_string());
    let gateways_csv = env::var("IPFS_GATEWAYS").unwrap_or_else(|_|
        "https://emerald-abundant-baboon-978.mypinata.cloud/ipfs,https://ipfs.io/ipfs,https://gateway.pinata.cloud/ipfs".to_string()
    );

    println!("\nCalling OCR API...");
    let client = reqwest::Client::new();
    let mut json: serde_json::Value = serde_json::json!({});
    let mut last_err: Option<String> = None;
    let mut tried = Vec::new();

    for gw in gateways_csv.split(',') {
        let gw = gw.trim();
        if gw.is_empty() { continue; }

        let ipfs_url = format!(
            "{}/{}?filename=invoice.{}",
            gw.trim_end_matches('/'),
            request.ipfs_hash,
            ocr_filetype
        );

        let ocr_url = format!(
            "https://api.ocr.space/parse/imageurl?apikey={}&url={}&language=eng&OCREngine=2&filetype={}",
            api_key,
            ipfs_url,
            ocr_filetype
        );

        println!("Trying OCR via gateway: {}", gw);
        tried.push(gw.to_string());

        match client.get(&ocr_url).send().await {
            Ok(resp) => {
                if let Ok(v) = resp.json::<serde_json::Value>().await {
                    let errored = v.get("IsErroredOnProcessing")
                        .and_then(|b| b.as_bool())
                        .unwrap_or(false);

                    if !errored {
                        json = v;
                        println!("OCR succeeded via {}", gw);
                        break;
                    } else {
                        last_err = Some(format!("OCR error via {}: {:?}", gw, v.get("ErrorMessage")));
                    }
                }
            }
            Err(e) => last_err = Some(format!("HTTP error via {}: {}", gw, e)),
        }
    }

    if json.as_object().map(|m| m.is_empty()).unwrap_or(true) {
        return Err(format!(
            "OCR failed across gateways (tried: {}): {}",
            tried.join(", "),
            last_err.unwrap_or_else(|| "unknown error".to_string())
        ).into());
    }

    println!("\n===== RAW OCR API RESPONSE =====");
    println!("{}", serde_json::to_string_pretty(&json)?);
    println!("================================\n");

    let ocr_text = json["ParsedResults"][0]["ParsedText"]
        .as_str()
        .ok_or("Failed to extract OCR text")?;
    println!("OCR Text extracted");

    let (vendor, amount, _) = parse_invoice(ocr_text);
    println!("Vendor: {}", vendor);

    let decimals: u8 = env::var("MINT_DECIMALS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(6);
    log_amount("Parsed amount", amount, decimals);

    if amount == 0 {
        eprintln!("Warning: parsed amount_base_units is 0; check OCR and parsing rules");
    }

    // 🔥 Force due date to 30 seconds from now (test mode)
    let now = chrono::Utc::now().timestamp();
    let due_date = now + 30;
    println!("⏰ Overriding due date to {} (30 seconds from now)", due_date);

    // Derive PDAs
    let (invoice_pda, _) = Pubkey::find_program_address(
        &[
            b"invoice",
            request.authority.as_ref(),
            &request.nonce.to_le_bytes()
        ],
        program_id,
    );

    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")
        .expect("ORG_AUTHORITY_PUBKEY must be set in .env");
    let org_authority = Pubkey::from_str(&org_authority_str)?;

    let (org_config_pda, _) = Pubkey::find_program_address(
        &[b"org_config", org_authority.as_ref()],
        program_id,
    );

    let (vendor_pda, _) = Pubkey::find_program_address(
        &[b"vendor", org_config_pda.as_ref(), vendor.as_bytes()],
        program_id,
    );

    // Build instruction data
    let mut hasher = Sha256::new();
    hasher.update(b"global:process_extraction_result");
    let disc: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();

    let mut data = disc.to_vec();
    data.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    data.extend_from_slice(vendor.as_bytes());
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&due_date.to_le_bytes());

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),
            AccountMeta::new(org_config_pda, false),
            AccountMeta::new_readonly(vendor_pda, false),
            AccountMeta::new(*request_pubkey, false),
            AccountMeta::new(invoice_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    println!("\nSubmitting to Solana...");
    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&keypair.pubkey()),
        &[keypair],
        recent_blockhash,
    );

    let _signature = match rpc_client.send_and_confirm_transaction(&tx) {
        Ok(sig) => {
            println!("Transaction successful: {}", sig);
            sig
        }
        Err(e) => {
            eprintln!("Transaction failed: {}", e);
            if let Ok(sim) = rpc_client.simulate_transaction(&tx) {
                if let Some(logs) = sim.value.logs {
                    for log in logs {
                        eprintln!("{}", log);
                    }
                }
            }
            return Err(e.into());
        }
    };

    if let Ok(acc) = rpc_client.get_account(&invoice_pda) {
        if let Ok(inv) = InvoiceAccountLite::from_account_data(&acc.data) {
            log_amount("On-chain invoice.amount", inv.amount, decimals);
        }
    }

    // Auto actions
    if env::var("AUTO_REQUEST_VRF").unwrap_or_default() == "1" {
        let _ = request_vrf_for_invoice(rpc_client, keypair, program_id, &invoice_pda).await;
    }

    if env::var("AUTO_FUND_ESCROW").unwrap_or_default() == "1" {
        println!("\nAuto-funding escrow...");
        if let Ok(_) = fund_escrow_for_invoice(
            rpc_client, keypair, program_id, &invoice_pda, &request.authority, request.nonce
        ).await {
            println!("Escrow funded successfully!");
            let _ = add_to_payment_queue(
                rpc_client, keypair, program_id, &invoice_pda, &request.authority, request.nonce
            ).await;
        }
    }

    Ok(())
}

fn parse_invoice(text: &str) -> (String, u64, i64) {
    println!("\n===== PARSING INVOICE DATA =====");
    let vendor = if let Some(bill_to_pos) = text.find("Bill to") {
        let after_bill_to = &text[bill_to_pos + 7..];
        let lines: Vec<&str> = after_bill_to.lines().collect();
        lines.iter()
            .skip(1)
            .find(|line| !line.trim().is_empty() && !line.contains("@"))
            .map(|line| line.trim().to_string())
            .unwrap_or_else(|| "Unknown Vendor".to_string())
    } else {
        let name_re = Regex::new(r"([A-Z][a-z]+\s+[A-Z][a-z]+)").unwrap();
        name_re.find(text)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "Unknown Vendor".to_string())
    };

    let amount_re = Regex::new(r"\$([0-9]+\.[0-9]{2})\s+due").unwrap();
    let amount_str = amount_re
        .captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or("0.00");
    let amount_float: f64 = amount_str.parse().unwrap_or(0.0);
    let amount = (amount_float * 1_000_000.0) as u64;

    println!("  Vendor: '{}', Amount: {}", vendor, amount);
    println!("================================\n");
    (vendor, amount, 0)
}

fn log_amount(label: &str, amount_base_units: u64, decimals: u8) {
    let denom = 10_u128.pow(decimals as u32);
    let base = amount_base_units as u128;
    let ui_int = base / denom;
    let ui_frac = base % denom;
    println!("{} => {}.{}", label, ui_int, ui_frac);
}

#[derive(Clone, Debug)]
struct InvoiceAccountLite {
    pub amount: u64,
}

impl InvoiceAccountLite {
    pub fn from_account_data(data: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        let mut offset = 8 + 32 + 32;
        let name_len = u32::from_le_bytes(data[offset..offset + 4].try_into()?) as usize;
        offset += 4 + name_len;
        let amount = u64::from_le_bytes(data[offset..offset + 8].try_into()?);
        Ok(InvoiceAccountLite { amount })
    }
}

async fn request_vrf_for_invoice(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    program_id: &Pubkey,
    invoice_pda: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")
        .expect("ORG_AUTHORITY_PUBKEY must be set in .env");
    let org_authority = Pubkey::from_str(&org_authority_str)?;

    let (org_config_pda, _) =
        Pubkey::find_program_address(&[b"org_config", org_authority.as_ref()], program_id);

    let queue_str =
        env::var("QUEUE_PUBKEY").expect("QUEUE_PUBKEY must be set in .env to auto-request VRF");
    let queue_pk = Pubkey::from_str(&queue_str)?;

    let mut h = Sha256::new();
    h.update(b"global:request_invoice_audit_vrf");
    let disc: [u8; 8] = h.finalize()[..8].try_into().unwrap();

    let mut data = Vec::new();
    data.extend_from_slice(&disc);
    data.push(42);

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(keypair.pubkey(), true),
            AccountMeta::new(org_config_pda, false),
            AccountMeta::new(*invoice_pda, false),
            AccountMeta::new(queue_pk, false),
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
    println!("🎲 VRF requested for invoice {}. Tx: {}", invoice_pda, sig);
    Ok(())
}
