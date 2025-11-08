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
    println!("Adding invoice to payment queue: {}", invoice_pda);

    let org_authority_str = env::var("ORG_AUTHORITY_PUBKEY")?;
    let org_authority = Pubkey::from_str(&org_authority_str)?;

    let (org_config_pda, _) = Pubkey::find_program_address(
        &[b"org_config", org_authority.as_ref()],
        program_id,
    );

    let (payment_queue_pda, _) = Pubkey::find_program_address(
        &[b"payment_queue", org_config_pda.as_ref()],
        program_id,
    );

    let mut hasher = Sha256::new();
    hasher.update(b"global:add_to_payment_queue");
    let disc: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(org_config_pda, false),
            AccountMeta::new_readonly(*invoice_pda, false),
            AccountMeta::new(payment_queue_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
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
