import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

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
  const [escrowAuthPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_auth"), invoicePda.toBuffer()],
    program.programId
  );

  const org = await program.account.orgConfig.fetch(orgConfigPda);
  const mintPk = org.mint as anchor.web3.PublicKey;

  const invoice = await program.account.invoiceAccount.fetch(invoicePda);
  if (!("inEscrowReadyToSettle" in (invoice as any).status)) {
    console.log("Invoice is not ready to settle. Current status:", invoice.status);
    return;
  }

  // Derive vendor ATA from vendor wallet
  const vendorPk = (invoice as any).vendor as anchor.web3.PublicKey | undefined;
  // If vendor pubkey is not stored, fetch vendor account PDA via invoice.vendor_name
  let vendorWallet: anchor.web3.PublicKey | null = null;
  try {
    // Fetch vendor account PDA via name
    const vendorName: string = (invoice as any).vendorName;
    const [vendorPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendorName)],
      program.programId
    );
    const vendorAcc = await program.account.vendorAccount.fetch(vendorPda);
    vendorWallet = (vendorAcc as any).wallet;
  } catch (e) {
    console.log("Failed to fetch vendor account:", (e as any).message);
    return;
  }

  const vendorAta = await getAssociatedTokenAddress(mintPk, vendorWallet!);
  const escrowAta = await getAssociatedTokenAddress(mintPk, escrowAuthPda, true);

  const tx = await program.methods
    .settleToVendor()
    .accounts({
      orgConfig: orgConfigPda,
      invoiceAccount: invoicePda,
      escrowAuthority: escrowAuthPda,
      vendorAta,
      escrowAta,
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("Settlement complete. Tx:", tx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
