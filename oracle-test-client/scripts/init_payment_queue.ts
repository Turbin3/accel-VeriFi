import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;
  const wallet = provider.wallet as any;

  // Org authority must sign; derive org_config from it
  const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("org_config"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const [paymentQueuePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("payment_queue"), orgConfigPda.toBuffer()],
    program.programId
  );

  console.log("Initializing PaymentQueue for org:", orgConfigPda.toBase58());
  console.log("PaymentQueue PDA:", paymentQueuePda.toBase58());

  try {
    const tx = await program.methods
      .initPaymentQueue()
      .accounts({
        authority: wallet.publicKey,
        orgConfig: orgConfigPda,
        paymentQueue: paymentQueuePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("PaymentQueue initialized. Tx:", tx);
  } catch (e: any) {
    console.error("Init payment queue failed:", e.message || e);
    process.exit(1);
  }
}

main();

