import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;

  const wallet = provider.wallet as any;
  const ipfsHash = process.env.IPFS_HASH || "bafkreibjntqp7vaggmvtlgs2sptrjhiwywmrqwlcdbdoi2ub2medwdqomm";
  const amount = new anchor.BN(parseInt(process.env.REQUEST_AMOUNT || "100", 10));
  const nonce = new anchor.BN(Date.now());

  const nonceLe = Buffer.from(nonce.toArray("le", 8));
  const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("request"), wallet.publicKey.toBuffer(), nonceLe],
    program.programId
  );

  console.log("Submitting invoice extraction request...");
  console.log("Program ID:", program.programId.toBase58());
  console.log("Authority:", wallet.publicKey.toBase58());
  console.log("Nonce (u64):", nonce.toString());
  console.log("Request PDA:", requestPda.toBase58());
  console.log("IPFS Hash:", ipfsHash);
  console.log("Amount:", amount.toString());

  try {
    const existing = await program.account.invoiceRequest.fetch(requestPda);
    console.log("Request already exists. Status:", existing.status);
    return;
  } catch {}

  // Send with strict accounts mapping
  const txSig = await program.methods
    .requestInvoiceExtraction(ipfsHash, amount, nonce)
    .accountsStrict({
      authority: wallet.publicKey,
      invoiceRequest: requestPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Submitted. Tx:", txSig);
  console.log(`Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
}

main().catch((e) => {
  console.error("Submit failed:", e);
  process.exit(1);
});
