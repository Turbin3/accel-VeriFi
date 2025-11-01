import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = (anchor.workspace as any).InvoiceClaim as any;
  const wallet = provider.wallet as any;

  const orgAuthority: anchor.web3.PublicKey = wallet.publicKey;

  const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("org_config"), orgAuthority.toBuffer()],
    program.programId
  );

  // 1) Initialize org (idempotent: will error if already exists)
  try {
    const perInvoiceCap = new anchor.BN(1_000_000_000); // 1,000 tokens (6dp) example
    const dailyCap = new anchor.BN(10_000_000_000);     // 10,000 tokens example
    const auditRateBps = 500; // 5%

    const tx = await program.methods
      .orgInit(orgAuthority, orgAuthority, perInvoiceCap, dailyCap, auditRateBps)
      .accounts({
        orgConfig: orgConfigPda,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Org initialized. Tx:", tx);
  } catch (e: any) {
    console.log("Org init likely already done:", e.message || e);
  }

  // 2) Set oracle_signer to backend oracle wallet if provided
  const oracleKeyStr = process.env.ORACLE_PUBKEY;
  if (oracleKeyStr) {
    try {
      const oracleKey = new anchor.web3.PublicKey(oracleKeyStr);
      const tx = await program.methods
        .updateOrgConfig({ oracleSigner: oracleKey, perInvoiceCap: null, dailyCap: null, paused: null, mint: null })
        .accounts({ authority: wallet.publicKey, orgConfig: orgConfigPda })
        .rpc();
      console.log("oracle_signer set to:", oracleKey.toBase58(), "Tx:", tx);
    } catch (e: any) {
      console.log("Update org config skipped:", e.message || e);
    }
  } else {
    console.log("ORACLE_PUBKEY not provided; skipping oracle_signer update.");
  }

  // 3) Register a vendor (matches what OCR likely returns)
  const vendorName = process.env.VENDOR_NAME || "Unknown Vendor";
  const [vendorPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendorName)],
    program.programId
  );
  try {
    const tx = await program.methods
      .registerVendor(vendorName, wallet.publicKey)
      .accounts({
        vendorAccount: vendorPda,
        orgConfig: orgConfigPda,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Vendor registered:", vendorName, "Tx:", tx);
  } catch (e: any) {
    console.log("Register vendor skipped:", e.message || e);
  }

  console.log("Bootstrap complete. Org:", orgConfigPda.toBase58(), "Vendor:", vendorName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
