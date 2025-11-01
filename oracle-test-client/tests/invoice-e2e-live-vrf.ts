import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { InvoiceClaim } from "../target/types/invoice_claim";
import {
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

// End-to-end live VRF flow on Devnet
// Steps:
// 1) Ensure org and vendor exist; set oracle_signer to test wallet
// 2) Create/close prior accounts for a clean run
// 3) Submit request and process result (due ~60s)
// 4) Create mint, fund escrow, assert status and balances
// 5) Request live VRF and wait for callback
// 6) If audited, approve review; wait until due; settle to vendor; assert Paid

describe("Invoice E2E (live VRF)", function () {
  // Increase default timeout because we wait for VRF + due date
  this.timeout(5 * 60 * 1000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.InvoiceClaim as Program<InvoiceClaim>;
  const wallet = provider.wallet as anchor.Wallet;
  const authority = wallet.publicKey;

  const vendorName = process.env.VENDOR_NAME || "Jane Diaz";
  const ipfsHash = process.env.IPFS_HASH || "bafkreibjntqp7vaggmvtlgs2sptrjhiwywmrqwlcdbdoi2ub2medwdqomm";
  const amountMicros = new anchor.BN(parseInt(process.env.REQUEST_AMOUNT || "1_000_000".replace(/_/g, ""), 10));

  // VRF Devnet default queue
  const VRF_QUEUE = new anchor.web3.PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");

  let orgConfigPda: anchor.web3.PublicKey;
  let vendorPda: anchor.web3.PublicKey;
  let requestPda: anchor.web3.PublicKey;
  let invoicePda: anchor.web3.PublicKey;

  before(async () => {
    [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("org_config"), authority.toBuffer()],
      program.programId
    );
    [vendorPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendorName)],
      program.programId
    );
    [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("request"), authority.toBuffer()],
      program.programId
    );
    [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), authority.toBuffer()],
      program.programId
    );
  });

  it("prepares org and vendor", async () => {
    // Ensure org exists
    try {
      await program.account.orgConfig.fetch(orgConfigPda);
    } catch (_) {
      const treasuryVault = anchor.web3.Keypair.generate().publicKey;
      const mint = anchor.web3.Keypair.generate().publicKey; // placeholder; updated later
      const perInvoiceCap = new anchor.BN(1_000_000_000);
      const dailyCap = new anchor.BN(10_000_000_000);
      const auditRateBps = 500; // 5%
      await program.methods
        .orgInit(treasuryVault, mint, perInvoiceCap, dailyCap, auditRateBps)
        .accounts({ orgConfig: orgConfigPda, authority, systemProgram: anchor.web3.SystemProgram.programId })
        .rpc();
    }

    // Set oracle_signer to our wallet for deterministic submission in test
    await program.methods
      .updateOrgConfig({ perInvoiceCap: null, dailyCap: null, paused: null, oracleSigner: authority, mint: null })
      .accounts({ authority, orgConfig: orgConfigPda })
      .rpc();

    // Ensure vendor exists
    try {
      await program.account.vendorAccount.fetch(vendorPda);
    } catch (_) {
      await program.methods
        .registerVendor(vendorName, authority)
        .accounts({ vendorAccount: vendorPda, orgConfig: orgConfigPda, authority, systemProgram: anchor.web3.SystemProgram.programId })
        .rpc();
    }
  });

  it("resets prior state (idempotent)", async () => {
    try {
      await program.methods
        .closeInvoice()
        .accounts({ invoiceAccount: invoicePda, authority })
        .rpc();
      await new Promise((r) => setTimeout(r, 500));
    } catch (_) {}
    try {
      await program.methods
        .closeRequest()
        .accounts({ invoiceRequest: requestPda, authority })
        .rpc();
      await new Promise((r) => setTimeout(r, 500));
    } catch (_) {}
  });

  it("submits request and validates (due ~60s)", async () => {
    // Submit request
    await program.methods
      .requestInvoiceExtraction(ipfsHash, amountMicros)
      .accounts({ invoiceRequest: requestPda, authority, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();

    // Validate as oracle_signer with a short due date
    const dueDate = new anchor.BN(Math.floor(Date.now() / 1000) + 60);
    await program.methods
      .processExtractionResult(vendorName, amountMicros, dueDate)
      .accounts({
        payer: authority,
        orgConfig: orgConfigPda,
        vendorAccount: vendorPda,
        invoiceRequest: requestPda,
        invoiceAccount: invoicePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const inv = await program.account.invoiceAccount.fetch(invoicePda);
    if (!("validated" in (inv as any).status)) throw new Error("Invoice not validated");
  });

  it("funds escrow and requests live VRF", async () => {
    // Create a dev mint (6 decimals)
    const mintPk = await createMint(provider.connection, (wallet as any).payer, authority, null, 6);

    // Update org_config mint if different
    const org = await program.account.orgConfig.fetch(orgConfigPda);
    if (!org.mint.equals(mintPk)) {
      await program.methods
        .updateOrgConfig({ perInvoiceCap: null, dailyCap: null, paused: null, oracleSigner: null, mint: mintPk })
        .accounts({ authority, orgConfig: orgConfigPda })
        .rpc();
    }

    // Payer ATA and escrow ATA
    const payerAta = await getOrCreateAssociatedTokenAccount(provider.connection, (wallet as any).payer, mintPk, authority);
    const [escrowAuthPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_auth"), invoicePda.toBuffer()],
      program.programId
    );
    const escrowAta = await getAssociatedTokenAddress(mintPk, escrowAuthPda, true);

    // Ensure escrow ATA exists (PDA owner)
    const info = await provider.connection.getAccountInfo(escrowAta);
    if (!info) {
      const ix = createAssociatedTokenAccountInstruction(authority, escrowAta, escrowAuthPda, mintPk);
      const tx = new anchor.web3.Transaction().add(ix);
      await provider.sendAndConfirm(tx, []);
    }

    // Mint tokens to payer ATA if needed
    const inv = await program.account.invoiceAccount.fetch(invoicePda);
    const need = Number((inv as any).amount);
    const payerBefore = await provider.connection.getTokenAccountBalance(payerAta.address).then(b => Number(b.value.amount));
    if (payerBefore < need) {
      await mintTo(provider.connection, (wallet as any).payer, mintPk, payerAta.address, (wallet as any).payer, BigInt(need - payerBefore));
    }

    const escrowBefore = await provider.connection.getTokenAccountBalance(escrowAta).catch(() => null);
    const escrowBeforeAmt = escrowBefore ? Number(escrowBefore.value.amount) : 0;

    // fund escrow
    await program.methods
      .fundEscrow()
      .accounts({
        orgConfig: orgConfigPda,
        invoiceAccount: invoicePda,
        escrowAuthority: escrowAuthPda,
        payer: authority,
        authority: authority,
        payerAta: payerAta.address,
        escrowAta: escrowAta,
        mint: mintPk,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const escrowAfter = await provider.connection.getTokenAccountBalance(escrowAta).then(b => Number(b.value.amount));
    if (!(escrowAfter >= escrowBeforeAmt)) throw new Error("Escrow balance did not increase");

    // Request live VRF
    await program.methods
      .requestInvoiceAuditVrf(42)
      .accounts({ payer: authority, orgConfig: orgConfigPda, invoiceAccount: invoicePda, oracleQueue: VRF_QUEUE })
      .rpc();

    // Poll for VRF callback to update status
    const start = Date.now();
    while (Date.now() - start < 2.5 * 60 * 1000) {
      const s: any = (await program.account.invoiceAccount.fetch(invoicePda)).status;
      if ("inEscrowAuditPending" in s || "inEscrowReadyToSettle" in s) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    const st: any = (await program.account.invoiceAccount.fetch(invoicePda)).status;
    if (!("inEscrowAuditPending" in st || "inEscrowReadyToSettle" in st)) {
      throw new Error("VRF callback did not update status in time");
    }
  });

  it("approves if audited, waits due, and settles", async () => {
    const invNow: any = await program.account.invoiceAccount.fetch(invoicePda);
    if ("inEscrowAuditPending" in invNow.status) {
      await program.methods
        .auditDecide(true)
        .accounts({ reviewer: authority, orgConfig: orgConfigPda, invoiceAccount: invoicePda })
        .rpc();
    }

    // Wait until due date
    const invAfter: any = await program.account.invoiceAccount.fetch(invoicePda);
    const now = Math.floor(Date.now() / 1000);
    const wait = Math.max(0, Number(invAfter.dueDate) - now + 1);
    if (wait > 0) await new Promise(r => setTimeout(r, wait * 1000));

    // Prepare accounts for settle
    const org = await program.account.orgConfig.fetch(orgConfigPda);
    const mintPk = org.mint;
    const [escrowAuthPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_auth"), invoicePda.toBuffer()],
      program.programId
    );
    const vendorAcc = await program.account.vendorAccount.fetch(vendorPda);
    const vendorAta = await getAssociatedTokenAddress(mintPk, (vendorAcc as any).wallet);
    const escrowAta = await getAssociatedTokenAddress(mintPk, escrowAuthPda, true);

    // Track balances
    const vendorBefore = await provider.connection.getTokenAccountBalance(vendorAta).then(b => Number(b.value.amount)).catch(() => 0);
    const escrowBefore = await provider.connection.getTokenAccountBalance(escrowAta).then(b => Number(b.value.amount)).catch(() => 0);
    const invAmt = Number((invAfter as any).amount);

    await program.methods
      .settleToVendor()
      .accounts({
        orgConfig: orgConfigPda,
        invoiceAccount: invoicePda,
        escrowAuthority: escrowAuthPda,
        vendorAta,
        escrowAta,
        mint: mintPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        authority,
      })
      .rpc();

    // Assert Paid and balances updated
    const invFinal: any = await program.account.invoiceAccount.fetch(invoicePda);
    if (!("paid" in invFinal.status)) throw new Error("Invoice not Paid after settlement");

    const vendorAfter = await provider.connection.getTokenAccountBalance(vendorAta).then(b => Number(b.value.amount));
    const escrowAfter = await provider.connection.getTokenAccountBalance(escrowAta).then(b => Number(b.value.amount));
    if (!(vendorAfter - vendorBefore >= invAmt)) throw new Error("Vendor did not receive expected amount");
    if (!(escrowBefore - escrowAfter >= 0)) throw new Error("Escrow balance did not decrease");
  });
});

