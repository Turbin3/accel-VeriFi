import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;

  const authStr = process.env.AUTH_PUBKEY;
  const nonceStr = process.env.NONCE;
  if (!authStr || !nonceStr) {
    console.error("Usage: AUTH_PUBKEY=<pubkey> NONCE=<u64> anchor run debug-request-pda");
    process.exit(1);
  }

  const authority = new anchor.web3.PublicKey(authStr);
  const nonce = new anchor.BN(nonceStr);

  console.log("Program ID:", program.programId.toBase58());
  console.log("Authority:", authority.toBase58());
  console.log("Nonce:", nonce.toString());

  const tx = await program.methods
    .debugRequestPda(authority, nonce)
    .accounts({})
    .rpc();

  console.log("Sent debug tx:", tx);
  console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

