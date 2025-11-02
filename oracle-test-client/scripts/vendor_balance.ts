import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;
  const wallet = provider.wallet as any;

  const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("org_config"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const org = await program.account.orgConfig.fetch(orgConfigPda);
  const mintPk = org.mint as anchor.web3.PublicKey;

  // Resolve vendor from the current invoice; otherwise use env VENDOR_NAME
  const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("invoice"), wallet.publicKey.toBuffer()],
    program.programId
  );

  let vendorWallet: anchor.web3.PublicKey | null = null;
  try {
    const inv = await program.account.invoiceAccount.fetch(invoicePda);
    const vendorPk = (inv as any).vendor as anchor.web3.PublicKey;
    const vendorAcc = await program.account.vendorAccount.fetch(vendorPk);
    vendorWallet = (vendorAcc as any).wallet as anchor.web3.PublicKey;
    console.log("Vendor (from invoice):", (vendorAcc as any).vendorName);
  } catch (_) {
    const vendorName = process.env.VENDOR_NAME || "Unknown Vendor";
    const [vendorPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendorName)],
      program.programId
    );
    const vendorAcc = await program.account.vendorAccount.fetch(vendorPda);
    vendorWallet = (vendorAcc as any).wallet as anchor.web3.PublicKey;
    console.log("Vendor (by name):", (vendorAcc as any).vendorName);
  }

  if (!vendorWallet) {
    console.log("Could not resolve vendor wallet");
    return;
  }

  const vendorAta = await getAssociatedTokenAddress(mintPk, vendorWallet);
  const balInfo = await provider.connection.getTokenAccountBalance(vendorAta).catch(() => null);
  if (!balInfo) {
    console.log("Vendor ATA does not exist yet:", vendorAta.toBase58());
    return;
  }

  const raw = BigInt(balInfo.value.amount);
  const decimals = balInfo.value.decimals;
  const ui = Number(raw) / 10 ** decimals;
  console.log("Mint:", mintPk.toBase58());
  console.log("Vendor wallet:", vendorWallet.toBase58());
  console.log("Vendor ATA:", vendorAta.toBase58());
  console.log("Balance:", balInfo.value.amount, `(raw, decimals=${decimals})`, "=", ui);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
