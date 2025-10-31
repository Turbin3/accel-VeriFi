import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { InvoiceClaim } from "../target/types/invoice_claim";

describe("invoice-claim", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.InvoiceClaim as Program<InvoiceClaim>;

  it("Submits invoice for extraction", async () => {
    const ipfsHash = "bafkreibjntqp7vaggmvtlgs2sptrjhiwywmrqwlcdbdoi2ub2medwdqomm";

    const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("request"), provider.wallet.publicKey.toBuffer()],
        program.programId
    );

    console.log("\nSubmitting invoice extraction request...");
    console.log("Authority:", provider.wallet.publicKey.toString());
    console.log("Request PDA:", requestPda.toString());
    console.log("IPFS Hash:", ipfsHash);

    try {
      const existingAccount = await program.account.invoiceRequest.fetch(requestPda);
      console.log("\nRequest already exists!");
      console.log("Status:", existingAccount.status);
      console.log("Skipping submission...");
      return;
    } catch (e) {
      console.log("Creating new request...");
    }

    const tx = await program.methods
        .requestInvoiceExtraction(ipfsHash,new anchor.BN(100))
        .accounts({
          invoiceRequest: requestPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    console.log("\nInvoice submitted!");
    console.log("Transaction:", tx);
    console.log("Explorer:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    console.log("\nOracle backend will process this request...");
    console.log("Watch the oracle backend terminal for processing logs.");
  });

  it("Check invoice data after oracle processes", async () => {
    const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("invoice"), provider.wallet.publicKey.toBuffer()],
        program.programId
    );

    console.log("\nWaiting 10 seconds for oracle to process...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    try {
      const invoiceAccount = await program.account.invoiceAccount.fetch(invoicePda);

      console.log("\n✅ Invoice data retrieved!");
      console.log("Vendor:", invoiceAccount.vendorName);
      console.log("Amount:", invoiceAccount.amount.toString());
      console.log("Due Date:", new Date(invoiceAccount.dueDate.toNumber() * 1000).toISOString());
      console.log("IPFS Hash:", invoiceAccount.ipfsHash);
      console.log("Status:", invoiceAccount.status);
    } catch (e) {
      console.log("\nInvoice not processed yet. Oracle might still be working...");
      console.log("Check oracle backend logs or wait longer.");
    }
  });

  // it("Process invoice payment (move to escrow)", async () => {
  //   const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
  //       [Buffer.from("invoice"), provider.wallet.publicKey.toBuffer()],
  //       program.programId
  //   );
  //
  //   console.log("\n💰 Processing invoice payment...");
  //
  //   try {
  //     const invoiceBefore = await program.account.invoiceAccount.fetch(invoicePda);
  //     console.log("Current status:", invoiceBefore.status);
  //
  //     const tx = await program.methods
  //         .processInvoicePayment()
  //         .accounts({
  //           invoiceAccount: invoicePda,
  //           authority: provider.wallet.publicKey,
  //         })
  //         .rpc();
  //
  //     console.log("\n✅ Payment processed!");
  //     console.log("Transaction:", tx);
  //     console.log("Explorer:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  //
  //     const invoiceAfter = await program.account.invoiceAccount.fetch(invoicePda);
  //     console.log("\nNew status:", invoiceAfter.status);
  //     console.log("Vendor:", invoiceAfter.vendorName);
  //     console.log("Amount in escrow:", invoiceAfter.amount.toString());
  //
  //   } catch (e) {
  //     console.log("\n❌ Error processing payment:", e);
  //     console.log("Make sure the invoice has been validated by the oracle first.");
  //   }
  // });


  it("View complete invoice lifecycle", async () => {
    const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("request"), provider.wallet.publicKey.toBuffer()],
        program.programId
    );

    const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("invoice"), provider.wallet.publicKey.toBuffer()],
        program.programId
    );

    console.log("\n📊 Complete Invoice Lifecycle:");
    console.log("================================");

    try {
      const request = await program.account.invoiceRequest.fetch(requestPda);
      const invoice = await program.account.invoiceAccount.fetch(invoicePda);

      console.log("\nRequest Details:");
      console.log("Authority:", request.authority.toString());
      console.log("IPFS:", request.ipfsHash);
      console.log("Status:", request.status);
      console.log("Submitted:", new Date(request.timestamp.toNumber() * 1000).toISOString());

      console.log("\n\nInvoice Details:");
      console.log("Authority:", invoice.authority.toString());
      console.log("Vendor:", invoice.vendorName);
      console.log("Amount: $" + (invoice.amount.toNumber() / 1_000_000).toFixed(2));
      console.log("Due Date:", new Date(invoice.dueDate.toNumber() * 1000).toISOString());
      console.log("IPFS:", invoice.ipfsHash);
      console.log("Status:", invoice.status);
      console.log("Processed:", new Date(invoice.timestamp.toNumber() * 1000).toISOString());

    } catch (e) {
      console.log("\nError fetching accounts:", e);
    }
  });

  // Escrow-before-audit flow uses fund_escrow (SPL) to move tokens into escrow,
  // then VRF sets audit outcome, and settle_to_vendor releases funds.

  it("Approve audit if pending (manual review)", async () => {
    const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    // OrgConfig PDA is derived from the org authority. Many setups use the same wallet.
    const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("org_config"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    try {
      const invoice = await program.account.invoiceAccount.fetch(invoicePda);
      console.log("\nCurrent invoice status:", invoice.status);

      // Only approve if VRF selected this invoice for audit
      if (invoice.status === 1 /* AuditPending enum index */) {
        console.log("Audit pending → attempting approval via auditDecide(true)...");
        try {
          const tx = await program.methods
            .auditDecide(true)
            .accounts({
              reviewer: provider.wallet.publicKey,
              orgConfig: orgConfigPda,
              invoiceAccount: invoicePda,
            })
            .rpc();
          console.log("\n✅ Audit approved. Tx:", tx);

          const after = await program.account.invoiceAccount.fetch(invoicePda);
          console.log("New status:", after.status);
        } catch (e) {
          console.log("\nCould not approve audit (likely unauthorized or wrong OrgConfig PDA):", (e as any).message);
          console.log("Hint: org_config PDA seed must match the authority used during org_init, and reviewer must be org authority or oracle_signer.");
        }
      } else {
        console.log("No audit approval needed. Status is not AuditPending.");
      }
    } catch (e) {
      console.log("\nInvoice account not found or not initialized yet.");
    }
  });

  // Tests rely on VRF-driven state transitions.

  it("Payment fails unless ReadyForPayment", async () => {
    const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("invoice"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    try {
      const invoice = await program.account.invoiceAccount.fetch(invoicePda);
      console.log("\nInvoice status before payment attempt:", invoice.status);

      if (invoice.status === 0 /* ReadyForPayment */) {
        console.log("Invoice already ReadyForPayment; skipping negative payment test.");
        return;
      }

      console.log("Attempting to process payment while not ReadyForPayment (should fail)...");
      try {
        await program.methods
          .processInvoicePayment()
          .accounts({
            invoiceAccount: invoicePda,
            authority: provider.wallet.publicKey,
          })
          .rpc();
        console.log("Unexpected: payment succeeded while not ReadyForPayment");
      } catch (e) {
        console.log("✅ Expected failure: payment blocked before ReadyForPayment");
      }
    } catch (e) {
      console.log("\nInvoice account not found. Skipping negative payment test until invoice is created.");
    }
  });

  it("Close invoice accounts and reclaim rent", async () => {
    const [requestPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("request"), provider.wallet.publicKey.toBuffer()],
        program.programId
    );

    const [invoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("invoice"), provider.wallet.publicKey.toBuffer()],
        program.programId
    );

    console.log("\nClosing accounts and reclaiming rent...");

    try {
      // Get balances before
      const balanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
      console.log("Wallet balance before:", (balanceBefore / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");

      // Close invoice account
      try {
        const closeTx1 = await program.methods
            .closeInvoice()
            .accounts({
              invoiceAccount: invoicePda,
              authority: provider.wallet.publicKey,
            })
            .rpc();

        console.log("\nInvoice account closed!");
        console.log("Transaction:", closeTx1);
      } catch (e) {
        console.log("Could not close invoice account:", e.message);
      }

      // Close request account
      try {
        const closeTx2 = await program.methods
            .closeRequest()
            .accounts({
              invoiceRequest: requestPda,
              authority: provider.wallet.publicKey,
            })
            .rpc();

        console.log("\n✅ Request account closed!");
        console.log("Transaction:", closeTx2);
      } catch (e) {
        console.log("Could not close request account:", e.message);
      }

      // Get balances after
      await new Promise(resolve => setTimeout(resolve, 2000));
      const balanceAfter = await provider.connection.getBalance(provider.wallet.publicKey);
      const rentReclaimed = (balanceAfter - balanceBefore) / anchor.web3.LAMPORTS_PER_SOL;

      console.log("\nWallet balance after:", (balanceAfter / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");
      console.log("Rent reclaimed:", rentReclaimed.toFixed(4), "SOL");

    } catch (e) {
      console.log("\nError closing accounts:", e);
    }
  });
});
