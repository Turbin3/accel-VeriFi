use solana_account_decoder::UiAccountEncoding;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};
use std::{env, str::FromStr};

use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};

// SPL program IDs
const TOKEN_PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey =
    solana_sdk::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

pub fn run_cranker(
    rpc_client: &RpcClient,
    payer: &Keypair,
    program_id: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    use solana_client::rpc_filter::{Memcmp, MemcmpEncodedBytes, RpcFilterType};

    // PaymentQueue discriminator (Anchor)
    let payment_queue_discriminator = [252u8, 158, 5, 213, 84, 121, 59, 80];
    let encoded = STANDARD.encode(&payment_queue_discriminator);
    println!("Discriminator base64 encoded: {}", encoded);

    let memcmp_filter = Memcmp::new(0, MemcmpEncodedBytes::Base64(encoded.clone()));
    let filters = RpcFilterType::Memcmp(memcmp_filter);

    println!("\n[DEBUG] Preparing to request program accounts with filter...");
    println!("[DEBUG] Filter discriminator (base64): {}", encoded);

    let payment_queues = rpc_client.get_program_accounts_with_config(
        program_id,
        solana_client::rpc_config::RpcProgramAccountsConfig {
            filters: Some(vec![filters]),
            account_config: solana_client::rpc_config::RpcAccountInfoConfig {
                encoding: Some(UiAccountEncoding::Base64),
                ..Default::default()
            },
            ..Default::default()
        },
    )?;

    println!(
        "[DEBUG] Found {} payment queue accounts",
        payment_queues.len()
    );

    for (queue_pubkey, account) in &payment_queues {
        let data = &account.data;

        println!(
            "[DEBUG] Queue Pubkey: {} (len {})",
            queue_pubkey,
            queue_pubkey.to_string().len()
        );
        println!("[DEBUG] Account data length: {}", data.len());

        // PaymentQueue layout:
        // 8 disc | 32 org_config | 4 count | count * (32 invoice | 32 vendor | 8 due | 8 amount)
        let mut offset = 8; // discriminator
        let org_config_pda = Pubkey::new(&data[offset..offset + 32]);
        offset += 32;

        if offset + 4 > data.len() {
            println!("[WARN] Queue account too small for count, skipping");
            continue;
        }

        let num_invoices =
            u32::from_le_bytes(data[offset..offset + 4].try_into()?) as usize;
        offset += 4;
        println!(
            "[DEBUG] Pending invoices count: {} in {}",
            num_invoices, queue_pubkey
        );

        // Fetch org_config once (to get mint etc.)
        let (stored_mint, org_authority, oracle_signer) =
            read_org_config_triplet(rpc_client, &org_config_pda)?;

        for _ in 0..num_invoices {
            if offset + 32 * 2 + 8 + 8 > data.len() {
                println!("[WARN] Queue entry truncated, stopping parse");
                break;
            }

            let invoice_pubkey = Pubkey::new(&data[offset..offset + 32]);
            let invoice_str = invoice_pubkey.to_string();
            offset += 32;

            let vendor_account_pda = Pubkey::new(&data[offset..offset + 32]); // NOTE: VendorAccount PDA (not wallet)
            offset += 32;

            let due_date = i64::from_le_bytes(data[offset..offset + 8].try_into()?);
            offset += 8;

            let amount = u64::from_le_bytes(data[offset..offset + 8].try_into()?);
            offset += 8;

            println!(
                "\n[DEBUG] Queue Entry -> invoice: {}, vendor_account: {}, due: {}, amount: {}",
                invoice_str, vendor_account_pda, due_date, amount
            );

            // --- Fetch and decode InvoiceAccount ---
            let invoice_account = match rpc_client.get_account(&invoice_pubkey) {
                Ok(acc) => acc,
                Err(e) => {
                    println!("[DEBUG] Failed to fetch invoice account data: {}", e);
                    continue;
                }
            };

            let inv_data = &invoice_account.data;
            if inv_data.len() < 8 + 32 {
                println!(
                    "[WARN] Invoice data too short, skipping {}",
                    invoice_str
                );
                continue;
            }

            // InvoiceAccount layout (verified):
            // 8 disc |
            // 32 authority |
            // 32 vendor_pubkey |
            // 4 vendor_name_len | vendor_name |
            // 8 amount |
            // 8 due_date |
            // 4 ipfs_len | ipfs |
            // 1 status |
            // 8 timestamp |
            // 8 nonce
            let mut inv_offset = 8;

            let inv_authority = Pubkey::new(&inv_data[inv_offset..inv_offset + 32]);
            inv_offset += 32;

            let inv_vendor_pda_in_account = Pubkey::new(&inv_data[inv_offset..inv_offset + 32]);
            inv_offset += 32;

            // vendor_name
            if inv_offset + 4 > inv_data.len() {
                println!(
                    "[WARN] Short read vendor_name len; skipping {}",
                    invoice_str
                );
                continue;
            }
            let name_len =
                u32::from_le_bytes(inv_data[inv_offset..inv_offset + 4].try_into()?)
                    as usize;
            inv_offset += 4;
            if inv_offset + name_len > inv_data.len() {
                println!("[WARN] Short read vendor_name; skipping {}", invoice_str);
                continue;
            }
            inv_offset += name_len;

            // amount + due
            if inv_offset + 16 > inv_data.len() {
                println!("[WARN] Short read amount/due; skipping {}", invoice_str);
                continue;
            }
            let _inv_amount =
                u64::from_le_bytes(inv_data[inv_offset..inv_offset + 8].try_into()?);
            inv_offset += 8;
            let _inv_due =
                i64::from_le_bytes(inv_data[inv_offset..inv_offset + 8].try_into()?);
            inv_offset += 8;

            // ipfs_hash
            if inv_offset + 4 > inv_data.len() {
                println!("[WARN] Short read ipfs len; skipping {}", invoice_str);
                continue;
            }
            let ipfs_len =
                u32::from_le_bytes(inv_data[inv_offset..inv_offset + 4].try_into()?)
                    as usize;
            inv_offset += 4;
            if inv_offset + ipfs_len > inv_data.len() {
                println!("[WARN] Short read ipfs; skipping {}", invoice_str);
                continue;
            }
            let ipfs_hash = String::from_utf8(
                inv_data[inv_offset..inv_offset + ipfs_len].to_vec(),
            )
                .unwrap_or_default();
            inv_offset += ipfs_len;

            // status + timestamp + nonce
            if inv_offset + 9 + 8 > inv_data.len() {
                println!(
                    "[WARN] Short read status/timestamp/nonce; skipping {}",
                    invoice_str
                );
                continue;
            }
            inv_offset += 1; // status
            inv_offset += 8; // timestamp

            let inv_nonce =
                u64::from_le_bytes(inv_data[inv_offset..inv_offset + 8].try_into()?);

            println!(
                "[DEBUG] Parsed invoice fields -> authority={}, vendor_pda_in_account={}, nonce={}, ipfs_sample={}",
                inv_authority,
                inv_vendor_pda_in_account,
                inv_nonce,
                &ipfs_hash.chars().take(12).collect::<String>()
            );

            // --- PDA check ---
            let pda_program_id = invoice_account.owner;

            let expected_current = Pubkey::find_program_address(
                &[
                    b"invoice",
                    inv_authority.as_ref(),
                    &inv_nonce.to_le_bytes(),
                ],
                &pda_program_id,
            )
                .0;

            let legacy_hash = sha256_bytes(ipfs_hash.as_bytes());
            let expected_legacy = Pubkey::find_program_address(
                &[b"invoice", inv_authority.as_ref(), &legacy_hash],
                &pda_program_id,
            )
                .0;

            let matches_current = expected_current == invoice_pubkey;
            let matches_legacy = expected_legacy == invoice_pubkey;

            if !(matches_current || matches_legacy) {
                eprintln!(
                    "[ERROR] Invoice PDA mismatch. Queue has {}, expected (current) {}, expected (legacy) {}. Skipping.",
                    invoice_pubkey, expected_current, expected_legacy
                );
                continue;
            } else {
                let which = if matches_current {
                    "current[authority+nonce]"
                } else {
                    "legacy[authority+sha256(ipfs)]"
                };
                println!("[DEBUG] PDA match via {} ✅", which);
            }

            // --- Derive vendor wallet from VendorAccount PDA ---
            let vendor_wallet = read_vendor_wallet_from_vendor_account(rpc_client, &vendor_account_pda)?;
            println!("[DEBUG] Vendor wallet from VendorAccount: {}", vendor_wallet);

            // --- Settle ---
            if let Err(e) = settle_to_vendor(
                rpc_client,
                payer,
                program_id,
                &invoice_pubkey,
                &org_config_pda,
                &org_authority,
                &stored_mint,
                &vendor_wallet, // wallet (owner of ATA), not the VendorAccount PDA
            ) {
                eprintln!(
                    "[ERROR] settle_to_vendor failed for {}: {}",
                    invoice_str, e
                );
            }
        }
    }
    Ok(())
}

/// Read org_config fields we need: (mint, authority, oracle_signer)
fn read_org_config_triplet(
    rpc: &RpcClient,
    org_config_pda: &Pubkey,
) -> Result<(Pubkey, Pubkey, Pubkey), Box<dyn std::error::Error>> {
    // Layout guess from your previous code:
    // 8 disc | 32 authority | 32 oracle_signer | 32 org(?) | 32 mint | ...
    // You previously used mint_offset = 8 + 32 + 32 + 32.
    let acc = rpc.get_account(org_config_pda)?;
    let data = acc.data;
    if data.len() < 8 + 32 + 32 + 32 + 32 {
        return Err("org_config too small".into());
    }
    let mut o = 8;
    let authority = Pubkey::new(&data[o..o + 32]); o += 32;
    let oracle_signer = Pubkey::new(&data[o..o + 32]); o += 32;
    o += 32; // org or other field
    let mint = Pubkey::new(&data[o..o + 32]);
    println!("[DEBUG] org_config -> authority={}, oracle_signer={}, mint={}", authority, oracle_signer, mint);
    Ok((mint, authority, oracle_signer))
}

/// Read the vendor wallet pubkey from VendorAccount PDA
fn read_vendor_wallet_from_vendor_account(
    rpc: &RpcClient,
    vendor_account_pda: &Pubkey,
) -> Result<Pubkey, Box<dyn std::error::Error>> {
    // VendorAccount layout (from your TS parser):
    // 8 disc | 32 org | 4 vendor_name_len | vendor_name | 32 wallet_pubkey | ... (is_active etc.)
    let acc = rpc.get_account(vendor_account_pda)?;
    let data = acc.data;
    if data.len() < 8 + 32 + 4 + 32 {
        return Err("VendorAccount too small".into());
    }
    let mut o = 8 + 32; // skip disc + org
    let name_len = u32::from_le_bytes(data[o..o + 4].try_into()?) as usize;
    o += 4;
    if o + name_len + 32 > data.len() {
        return Err("VendorAccount short read (name/wallet)".into());
    }
    o += name_len;
    let wallet = Pubkey::new(&data[o..o + 32]);
    Ok(wallet)
}

fn settle_to_vendor(
    rpc_client: &RpcClient,
    payer: &Keypair,
    program_id: &Pubkey,
    invoice_pubkey: &Pubkey,
    org_config_pda: &Pubkey,
    _org_authority: &Pubkey,
    mint_pubkey: &Pubkey,
    vendor_wallet: &Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    use spl_associated_token_account::instruction::create_associated_token_account;

    println!(
        "\n[DEBUG] Preparing to settle invoice: {}",
        invoice_pubkey
    );

    // Escrow auth PDA (owner of escrow ATA)
    let (escrow_auth_pda, bump) =
        Pubkey::find_program_address(&[b"escrow_auth", invoice_pubkey.as_ref()], program_id);
    println!(
        "[DEBUG] Derived escrow_auth PDA: {}, bump: {}",
        escrow_auth_pda, bump
    );

    // Derive ATAs:
    // - vendor ATA should be owned by the VENDOR WALLET (not the VendorAccount PDA)
    // - escrow ATA owned by escrow_auth_pda
    let vendor_ata = spl_associated_token_account::get_associated_token_address(vendor_wallet, mint_pubkey);
    let escrow_ata = spl_associated_token_account::get_associated_token_address(&escrow_auth_pda, mint_pubkey);

    println!("[DEBUG] Using mint: {}", mint_pubkey);
    println!("[DEBUG] Derived vendor_wallet ATA: {}", vendor_ata);
    println!("[DEBUG] Derived escrow ATA: {}", escrow_ata);

    // Create missing ATAs (in the same tx before calling your program)
    let mut pre_ixs: Vec<Instruction> = vec![];

    if rpc_client.get_account(&vendor_ata).is_err() {
        println!("[INFO] Vendor ATA missing. Will create: {}", vendor_ata);
        pre_ixs.push(create_associated_token_account(
            &payer.pubkey(),     // fee payer
            vendor_wallet,       // ATA owner
            mint_pubkey,
            &TOKEN_PROGRAM_ID,
        ));
    }

    if rpc_client.get_account(&escrow_ata).is_err() {
        println!("[INFO] Escrow ATA missing. Will create: {}", escrow_ata);
        pre_ixs.push(create_associated_token_account(
            &payer.pubkey(),     // fee payer
            &escrow_auth_pda,    // ATA owner (PDA)
            mint_pubkey,
            &TOKEN_PROGRAM_ID,
        ));
    }

    // Build settle instruction (8-byte discriminator only)
    let mut hasher = Sha256::new();
    hasher.update(b"global:settle_to_vendor");
    let ix_disc: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();

    // Accounts: org_config, invoice_account, escrow_authority, vendor_ata, escrow_ata, mint, token_program, signer
    let settle_ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(*org_config_pda, false),
            AccountMeta::new(*invoice_pubkey, false),
            AccountMeta::new(escrow_auth_pda, false),
            AccountMeta::new(vendor_ata, false),
            AccountMeta::new(escrow_ata, false),
            AccountMeta::new_readonly(*mint_pubkey, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
            AccountMeta::new(payer.pubkey(), true),
        ],
        data: ix_disc.to_vec(),
    };

    // Send all in one transaction: create-missing-ATAs → settle_to_vendor
    let mut instructions = pre_ixs;
    instructions.push(settle_ix);

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &instructions,
        Some(&payer.pubkey()),
        &[payer],
        recent_blockhash,
    );

    match rpc_client.send_and_confirm_transaction(&tx) {
        Ok(sig) => {
            println!("[DEBUG] Transaction signature: {}", sig);
        }
        Err(e) => {
            eprintln!("❌ send_and_confirm_transaction failed: {}", e);
            if let Ok(sim) = rpc_client.simulate_transaction(&tx) {
                eprintln!("\n===== TRANSACTION LOGS =====");
                if let Some(logs) = sim.value.logs {
                    for log in logs {
                        eprintln!("{}", log);
                    }
                }
                eprintln!("===========================\n");
            }
            return Err(e.into());
        }
    }

    Ok(())
}

/// sha256 -> 32-byte array
fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let out = hasher.finalize();
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&out[..32]);
    bytes
}
