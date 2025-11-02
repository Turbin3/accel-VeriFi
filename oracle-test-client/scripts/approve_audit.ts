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
    [Buffer.from("invoice"), wallet.publicKey.toBuffer()],
    program.programId
  );

  // Ensure current status is InEscrowAuditPending
  const inv = await program.account.invoiceAccount.fetch(invoicePda);
  if (!("inEscrowAuditPending" in (inv as any).status)) {
    console.log("Invoice not in audit-pending state. Current status:", (inv as any).status);
    return;
  }

  const tx = await program.methods
    .auditDecide(true)
    .accounts({ reviewer: wallet.publicKey, orgConfig: orgConfigPda, invoiceAccount: invoicePda })
    .rpc();

  console.log("Audit approved. Tx:", tx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

