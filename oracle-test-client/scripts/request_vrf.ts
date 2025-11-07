import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;

  const wallet = provider.wallet as any;

  const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("org_config"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("unused-seed")], // placeholder; we'll override via scan below
    program.programId
  );

  const queueStr = process.env.QUEUE_PUBKEY;
  if (!queueStr) {
    console.error(
      "Missing QUEUE_PUBKEY env var. Set it to the VRF default queue public key (matches on-chain DEFAULT_QUEUE)."
    );
    process.exit(1);
  }
  const queuePk = new anchor.web3.PublicKey(queueStr);

  try {
    // Find the latest invoice for this authority by scanning program accounts
    const invoiceDisc = Buffer.from([105, 207, 226, 227, 85, 35, 132, 40]);
    const accounts = await provider.connection.getProgramAccounts(program.programId);
    const myInvoices = accounts.filter(({ account }) => {
      if (account.data.length < 100) return false;
      const disc = account.data.slice(0, 8);
      if (!disc.equals(invoiceDisc)) return false;
      const auth = new anchor.web3.PublicKey(account.data.slice(8, 40));
      return auth.equals(wallet.publicKey);
    });
    if (myInvoices.length === 0) {
      throw new Error("No invoice accounts found for this authority");
    }
    const invPubkey = myInvoices[0].pubkey; // naive pick; improve selection if needed

    const tx = await program.methods
      .requestInvoiceAuditVrf(42)
      .accounts({
        payer: wallet.publicKey,
        orgConfig: orgConfigPda,
        invoiceAccount: invPubkey,
        oracleQueue: queuePk,
      })
      .rpc();
    console.log("VRF requested. Tx:", tx);
    console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  } catch (e: any) {
    console.error("VRF request failed:", e.message || e);
    process.exit(1);
  }
}

main();
