use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};
use sha2::{Digest, Sha256};
use std::env;
use std::str::FromStr;
use spl_associated_token_account::get_associated_token_address;

/// SPL Token Program and Associated Token Program IDs
const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/// Decode mint from a spl token account (first 32 bytes)
fn get_token_account_mint(data: &[u8]) -> Pubkey {
    Pubkey::new(&data[0..32])
}

pub async fn fund_escrow_for_invoice(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    program_id: &Pubkey,
    invoice_pda: &Pubkey,
    authority: &Pubkey,
    nonce: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Funding escrow for invoice: {}", invoice_pda);

    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")?;
    let org_authority = Pubkey::from_str(&org_authority_str)?;

    let (org_config_pda, _) = Pubkey::find_program_address(
        &[b"org_config", org_authority.as_ref()],
        program_id,
    );

    let (escrow_auth_pda, _) = Pubkey::find_program_address(
        &[b"escrow_auth", invoice_pda.as_ref()],
        program_id,
    );

    let payer_ata = Pubkey::from_str(&env::var("PAYER_TOKEN_ACCOUNT")?)?;
    let mint = Pubkey::from_str(&env::var("TOKEN_MINT")?)?;

    // Debug logs for all accounts and mints
    println!("ORG_AUTHORITY_PUBKEY: {}", org_authority);
    println!("ORG_CONFIG PDA: {}", org_config_pda);
    println!("ESCROW_AUTH PDA: {}", escrow_auth_pda);
    println!("INVOICE PDA: {}", invoice_pda);
    println!("PAYER: {}", keypair.pubkey());
    println!("PAYER_ATA: {}", payer_ata);
    println!("MINT supplied: {}", mint);

    // Fetch and print on-chain org_config.mint
    let org_config_account = rpc_client.get_account(&org_config_pda)?;
    let mint_offset = 8 + 32 + 32 + 32;
    let org_config_mint = Pubkey::new(&org_config_account.data[mint_offset..mint_offset+32]);
    println!("ORG_CONFIG.STORED_MINT: {}", org_config_mint);

    // Print payer ATA mint
    if let Ok(acc) = rpc_client.get_account(&payer_ata) {
        let payer_ata_mint = get_token_account_mint(&acc.data);
        println!("PAYER_ATA.MINT: {}", payer_ata_mint);
    } else {
        println!("PAYER_ATA does not exist.");
    }

    // Derive escrow ATA
    let escrow_ata = get_associated_token_address(&escrow_auth_pda, &mint);
    println!("ESCROW_ATA: {}", escrow_ata);

    // Print escrow ATA mint if exists
    if let Ok(acc) = rpc_client.get_account(&escrow_ata) {
        let escrow_ata_mint = get_token_account_mint(&acc.data);
        println!("ESCROW_ATA.MINT: {}", escrow_ata_mint);
    } else {
        println!("ESCROW_ATA does not exist—will create.");
    }

    // Check if escrow ATA exists, if not, create it first
    if rpc_client.get_account(&escrow_ata).is_err() {
        println!("Creating escrow token account: {}", escrow_ata);

        let create_ata_ix = spl_associated_token_account::instruction::create_associated_token_account(
            &keypair.pubkey(),  // payer
            &escrow_auth_pda,   // owner
            &mint,              // mint
            &Pubkey::from_str(SPL_TOKEN_PROGRAM_ID)?,
        );

        let recent_blockhash = rpc_client.get_latest_blockhash()?;
        let create_tx = Transaction::new_signed_with_payer(
            &[create_ata_ix],
            Some(&keypair.pubkey()),
            &[keypair],
            recent_blockhash,
        );

        rpc_client.send_and_confirm_transaction(&create_tx)?;
        println!("Escrow token account created");
    }

    let token_program = Pubkey::from_str(SPL_TOKEN_PROGRAM_ID)?;

    let mut hasher = Sha256::new();
    hasher.update(b"global:fund_escrow");
    let disc: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(org_config_pda, false),           // org_config
            AccountMeta::new(*invoice_pda, false),             // invoice_account
            AccountMeta::new_readonly(escrow_auth_pda, false), // escrow_authority
            AccountMeta::new(keypair.pubkey(), true),          // payer (signer)
            AccountMeta::new_readonly(*authority, false),      // authority
            AccountMeta::new(payer_ata, false),                // payer_ata
            AccountMeta::new(escrow_ata, false),               // escrow_ata
            AccountMeta::new_readonly(mint, false),            // mint
            AccountMeta::new_readonly(token_program, false),   // token_program
        ],
        data: disc.to_vec(),
    };

    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&keypair.pubkey()),
        &[keypair],
        recent_blockhash,
    );

    match rpc_client.send_and_confirm_transaction(&tx) {
        Ok(sig) => {
            println!("Escrow funded successfully. Transaction: {}", sig);
            Ok(())
        }
        Err(e) => {
            eprintln!("Escrow funding failed: {}", e);

            if let Ok(sim) = rpc_client.simulate_transaction(&tx) {
                eprintln!("\n===== TRANSACTION LOGS =====");
                if let Some(logs) = sim.value.logs {
                    for log in logs {
                        eprintln!("{}", log);
                    }
                }
                eprintln!("============================\n");
            }

            Err(e.into())
        }
    }
}
