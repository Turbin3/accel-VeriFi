import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;
  const wallet = provider.wallet as any;

  const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("invoice"), wallet.publicKey.toBuffer()],
    program.programId
  );

  const inv = await program.account.invoiceAccount.fetchNullable(invoicePda);
  if (!inv) {
    console.log("Invoice account does not exist yet:", invoicePda.toBase58());
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const due = Number((inv as any).dueDate);
  const amount = Number((inv as any).amount);

  console.log("Invoice:", invoicePda.toBase58());
  console.log("status =", (inv as any).status);
  console.log("amount =", amount);
  console.log("dueDate =", due, "(in", Math.max(0, due - now), "s)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

