import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;
  const wallet = provider.wallet as any;

  // Derive PDAs
  const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("org_config"), wallet.publicKey.toBuffer()],
    program.programId
  );
  // Find the invoice account for this authority by scanning
  const invoiceDisc = Buffer.from([105, 207, 226, 227, 85, 35, 132, 40]);
  const accounts = await provider.connection.getProgramAccounts(program.programId);
  const invAcct = accounts.find(({ account }) => {
    if (account.data.length < 100) return false;
    const disc = account.data.slice(0, 8);
    if (!disc.equals(invoiceDisc)) return false;
    const auth = new anchor.web3.PublicKey(account.data.slice(8, 40));
    return auth.equals(wallet.publicKey);
  });
  if (!invAcct) {
    console.log("No invoice account found for this authority");
    return;
  }
  const invoicePda = invAcct.pubkey;
  const [escrowAuthPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_auth"), invoicePda.toBuffer()],
    program.programId
  );

  // Ensure invoice is Validated (escrow-before-audit flow)
  const invoice = await program.account.invoiceAccount.fetch(invoicePda);
  if (!("validated" in (invoice as any).status)) {
    console.log("Invoice is not Validated. Current status:", invoice.status);
    return;
  }

  // Use provided MINT or create a dev mint with 6 decimals
  let mintPk: anchor.web3.PublicKey;
  if (process.env.MINT) {
    mintPk = new anchor.web3.PublicKey(process.env.MINT);
  } else {
    mintPk = await createMint(provider.connection, wallet.payer, wallet.publicKey, null, 6);
    console.log("Created dev mint:", mintPk.toBase58());
  }

  // Update org_config mint if needed
  try {
    const org = await program.account.orgConfig.fetch(orgConfigPda);
    if (!org.mint.equals(mintPk)) {
      const tx = await program.methods
        .updateOrgConfig({ oracleSigner: null, perInvoiceCap: null, dailyCap: null, paused: null, mint: mintPk })
        .accounts({ authority: wallet.publicKey, orgConfig: orgConfigPda })
        .rpc();
      console.log("Org mint updated. Tx:", tx);
    }
  } catch (e) {
    console.log("Org config not found or update failed:", (e as any).message);
    return;
  }

  // Create/fetch ATAs
  const payerAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mintPk,
    wallet.publicKey
  );
  const escrowAtaAddr = await getAssociatedTokenAddress(mintPk, escrowAuthPda, true);
  // Ensure escrow ATA exists (owner is a PDA; allowed off-curve)
  const info = await provider.connection.getAccountInfo(escrowAtaAddr);
  if (!info) {
    const ix = createAssociatedTokenAccountInstruction(
      wallet.publicKey,           // payer
      escrowAtaAddr,              // ATA address
      escrowAuthPda,              // owner (PDA, off-curve allowed)
      mintPk
    );
    const txix = new anchor.web3.Transaction().add(ix);
    const sig = await provider.sendAndConfirm(txix, []);
    console.log("Created escrow ATA:", escrowAtaAddr.toBase58(), "Tx:", sig);
  }

  // Mint tokens to payer if needed
  const need = Number((invoice as any).amount as anchor.BN);
  if (Number(payerAta.amount) < need) {
    await mintTo(provider.connection, wallet.payer, mintPk, payerAta.address, wallet.payer, BigInt(need - Number(payerAta.amount)));
    console.log("Minted tokens to payer ATA");
  }

  // Call fund_escrow
  const tx = await program.methods
    .fundEscrow()
    .accounts({
      orgConfig: orgConfigPda,
      invoiceAccount: invoicePda,
      escrowAuthority: escrowAuthPda,
      payer: wallet.publicKey,
      authority: wallet.publicKey,
      payerAta: payerAta.address,
      escrowAta: escrowAtaAddr,
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("Escrow funded. Tx:", tx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
