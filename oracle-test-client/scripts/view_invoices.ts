import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;

  const filterAuth = process.env.FILTER_AUTHORITY
    ? new anchor.web3.PublicKey(process.env.FILTER_AUTHORITY)
    : provider.wallet.publicKey;

  // Anchor account discriminator for InvoiceAccount
  const INVOICE_DISC = Buffer.from([105, 207, 226, 227, 85, 35, 132, 40]);

  const accounts = await provider.connection.getProgramAccounts(program.programId);
  const mine = accounts.filter(({ account }) => {
    if (account.data.length < 100) return false;
    const disc = account.data.slice(0, 8);
    if (!disc.equals(INVOICE_DISC)) return false;
    const auth = new anchor.web3.PublicKey(account.data.slice(8, 40));
    return auth.equals(filterAuth);
  });

  if (mine.length === 0) {
    console.log("No invoices found for:", filterAuth.toBase58());
    return;
  }

  console.log(`Found ${mine.length} invoice(s) for ${filterAuth.toBase58()}`);
  for (const { pubkey } of mine) {
    try {
      const inv = await program.account.invoiceAccount.fetch(pubkey);
      console.log({
        invoicePda: pubkey.toBase58(),
        status: inv.status,
        nonce: inv.nonce.toString(),
        amount: inv.amount.toString(),
        vendorName: inv.vendorName,
      });
    } catch (e: any) {
      console.log("Failed to fetch invoice:", pubkey.toBase58(), e.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

