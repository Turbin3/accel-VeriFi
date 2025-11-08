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

pub async fn add_to_payment_queue(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    program_id: &Pubkey,
    invoice_pda: &Pubkey,
    authority: &Pubkey,
    nonce: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting add_to_payment_queue for invoice: {}", invoice_pda);

    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")?;
    println!("ORG_AUTHORITY_PUBKEY from env: {}", org_authority_str);
    let org_authority = Pubkey::from_str(&org_authority_str)?;

    let (org_config_pda, _) = Pubkey::find_program_address(
        &[b"org_config", org_authority.as_ref()],
        program_id,
    );
    println!("Derived org_config PDA: {}", org_config_pda);

    let (payment_queue_pda, _) = Pubkey::find_program_address(
        &[b"payment_queue", org_config_pda.as_ref()],
        program_id,
    );
    println!("Derived payment_queue PDA: {}", payment_queue_pda);

    // Check if payment queue PDA exists; if not, initialize it
    if rpc_client.get_account(&payment_queue_pda).is_err() {
        println!("Payment queue PDA does not exist. Initializing...");

        const INIT_PAYMENT_QUEUE_DISC: [u8; 8] = [158, 252, 5, 213, 84, 121, 59, 80]; // Replace with exact from IDL if differs

        assert_eq!(
            keypair.pubkey(),
            *authority,
            "Keypair pubkey must match authority pubkey"
        );

        let init_ix = Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new(org_authority, true),    // authority signer
                AccountMeta::new(org_config_pda, false),  // org config
                AccountMeta::new(payment_queue_pda, false), // payment queue PDA (will be initialized)
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: INIT_PAYMENT_QUEUE_DISC.to_vec(),
        };

        let recent_blockhash = rpc_client.get_latest_blockhash()?;
        println!("Sending transaction to initialize payment queue...");
        let init_tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&keypair.pubkey()),
            &[keypair],
            recent_blockhash,
        );

        match rpc_client.send_and_confirm_transaction(&init_tx) {
            Ok(sig) => println!("Payment queue initialized successfully. Tx: {}", sig),
            Err(e) => {
                eprintln!("Failed to initialize payment queue: {}", e);
                return Err(e.into());
            }
        }
    } else {
        println!("Payment queue PDA exists.");
    }

    // Add invoice to payment queue
    const ADD_TO_PAYMENT_QUEUE_DISC: [u8; 8] = [215, 176, 65, 168, 128, 96, 161, 68]; // From your IDL

    println!("Preparing add_to_payment_queue instruction...");

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(org_config_pda, false),
            AccountMeta::new_readonly(*invoice_pda, false),
            AccountMeta::new(payment_queue_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: ADD_TO_PAYMENT_QUEUE_DISC.to_vec(),
    };


    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    println!("Signers for transaction:");
    for signer in &[keypair] {
        println!("Signer pubkey: {}", signer.pubkey());
    }

    println!("Sending transaction to add invoice to payment queue...");
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&keypair.pubkey()),
        &[keypair],
        recent_blockhash,
    );

    match rpc_client.send_and_confirm_transaction(&tx) {
        Ok(sig) => {
            println!("Added to payment queue successfully. Transaction: {}", sig);
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to add to payment queue: {}", e);

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
