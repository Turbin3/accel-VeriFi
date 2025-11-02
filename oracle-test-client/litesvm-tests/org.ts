import { describe, it } from "mocha";
import { expect } from "chai";
import { Program } from "@coral-xyz/anchor";
import { InvoiceClaim } from "../target/types/invoice_claim";
import idl from "../target/idl/invoice_claim.json";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AccountInfoBytes, ComputeBudget } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import * as anchor from "@coral-xyz/anchor";

describe("Organization Management Tests", () => {
    let litesvm: any;
    let provider: LiteSVMProvider;
    let program: Program<InvoiceClaim>;
    let authority: Keypair;

    // Test parameters
    const treasuryVault = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const perInvoiceCap = new anchor.BN(1_000_000_000); // 1000 USDC (6 decimals)
    const dailyCap = new anchor.BN(10_000_000_000); // 10,000 USDC
    const auditRateBps = 500; // 5%

    let orgConfigPda: PublicKey;

    before(async () => {
        // Initialize LiteSVM
        litesvm = fromWorkspace("./");
        litesvm.withLogBytesLimit(null);

        const computeBudget = new ComputeBudget();
        computeBudget.computeUnitLimit = 400_000n;
        litesvm.withComputeBudget(computeBudget);

        // Create provider and program
        provider = new LiteSVMProvider(litesvm);
        program = new Program<InvoiceClaim>(idl, provider);

        // Setup authority with funds
        authority = Keypair.generate();
        litesvm.setAccount(authority.publicKey, {
            lamports: 100 * LAMPORTS_PER_SOL,
            data: Buffer.alloc(0),
            executable: false,
            owner: SystemProgram.programId,
        });

        // Derive org config PDA
        [orgConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("org_config"), authority.publicKey.toBuffer()],
            program.programId
        );
    });

    describe("Org Initialization", () => {
        it("Successfully initializes organization config", async () => {
            console.log("\nInitializing organization...");
            console.log("Authority:", authority.publicKey.toString());
            console.log("Org Config PDA:", orgConfigPda.toString());
            console.log("Treasury Vault:", treasuryVault.toString());
            console.log("Mint:", mint.toString());

            const tx = await program.methods
                .orgInit(
                    treasuryVault,
                    mint,
                    perInvoiceCap,
                    dailyCap,
                    auditRateBps
                )
                .accounts({
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([authority])
                .rpc();

            console.log("\nOrganization initialized!");
            console.log("Transaction:", tx);

            // Fetch and verify the account
            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);

            expect(orgConfig.authority.toString()).to.equal(authority.publicKey.toString());
            expect(orgConfig.oracleSigner.toString()).to.equal(authority.publicKey.toString());
            expect(orgConfig.treasuryVault.toString()).to.equal(treasuryVault.toString());
            expect(orgConfig.mint.toString()).to.equal(mint.toString());
            expect(orgConfig.perInvoiceCap.toString()).to.equal(perInvoiceCap.toString());
            expect(orgConfig.dailyCap.toString()).to.equal(dailyCap.toString());
            expect(orgConfig.dailySpent.toString()).to.equal("0");
            expect(orgConfig.auditRateBps).to.equal(auditRateBps);
            expect(orgConfig.paused).to.equal(false);
            expect(orgConfig.invoiceCounter.toString()).to.equal("0");
            expect(orgConfig.version).to.equal(1);

            console.log("\nOrganization Config:");
            console.log("Authority:", orgConfig.authority.toString());
            console.log("Oracle Signer:", orgConfig.oracleSigner.toString());
            console.log("Per Invoice Cap:", orgConfig.perInvoiceCap.toString());
            console.log("Daily Cap:", orgConfig.dailyCap.toString());
            console.log("Audit Rate (bps):", orgConfig.auditRateBps);
            console.log("Paused:", orgConfig.paused);
            console.log("Version:", orgConfig.version);
            console.log("\n");
        });

        it("Fails to initialize with invalid per_invoice_cap (zero)", async () => {
            const newAuthority = Keypair.generate();
            litesvm.setAccount(newAuthority.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            const [newOrgPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("org_config"), newAuthority.publicKey.toBuffer()],
                program.programId
            );

            try {
                await program.methods
                    .orgInit(
                        treasuryVault,
                        mint,
                        new anchor.BN(0), // Invalid: zero
                        dailyCap,
                        auditRateBps
                    )
                    .accounts({
                        orgConfig: newOrgPda,
                        authority: newAuthority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([newAuthority])
                    .rpc();

                expect.fail("Should have failed with InvalidAmount error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("InvalidAmount");
                console.log("Correctly rejected zero per_invoice_cap");
            }
            console.log("\n");
        });

        it("Fails to initialize with invalid daily_cap (zero)", async () => {
            const newAuthority = Keypair.generate();
            litesvm.setAccount(newAuthority.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            const [newOrgPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("org_config"), newAuthority.publicKey.toBuffer()],
                program.programId
            );

            try {
                await program.methods
                    .orgInit(
                        treasuryVault,
                        mint,
                        perInvoiceCap,
                        new anchor.BN(0), // Invalid: zero
                        auditRateBps
                    )
                    .accounts({
                        orgConfig: newOrgPda,
                        authority: newAuthority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([newAuthority])
                    .rpc();

                expect.fail("Should have failed with InvalidAmount error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("InvalidAmount");
                console.log("Correctly rejected zero daily_cap");
            }
            console.log("\n");
        });

        it("Fails when daily_cap is less than per_invoice_cap", async () => {
            const newAuthority = Keypair.generate();
            litesvm.setAccount(newAuthority.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            const [newOrgPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("org_config"), newAuthority.publicKey.toBuffer()],
                program.programId
            );

            try {
                await program.methods
                    .orgInit(
                        treasuryVault,
                        mint,
                        new anchor.BN(10_000_000_000), // 10,000
                        new anchor.BN(1_000_000_000), // 1,000 (less than per_invoice_cap)
                        auditRateBps
                    )
                    .accounts({
                        orgConfig: newOrgPda,
                        authority: newAuthority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([newAuthority])
                    .rpc();

                expect.fail("Should have failed with CapExceeded error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("CapExceeded");
                console.log("Correctly rejected daily_cap < per_invoice_cap");
            }
            console.log("\n");
        });

        it("Fails with invalid audit_rate_bps (> 10000)", async () => {
            const newAuthority = Keypair.generate();
            litesvm.setAccount(newAuthority.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            const [newOrgPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("org_config"), newAuthority.publicKey.toBuffer()],
                program.programId
            );

            try {
                await program.methods
                    .orgInit(
                        treasuryVault,
                        mint,
                        perInvoiceCap,
                        dailyCap,
                        10001 // Invalid: > 100%
                    )
                    .accounts({
                        orgConfig: newOrgPda,
                        authority: newAuthority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([newAuthority])
                    .rpc();

                expect.fail("Should have failed with InvalidAuditRate error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("InvalidAuditRate");
                console.log("Correctly rejected audit_rate_bps > 10000");
            }
            console.log("\n");
        });

        it("Fails to reinitialize existing org config", async () => {
            try {
                await program.methods
                    .orgInit(
                        treasuryVault,
                        mint,
                        perInvoiceCap,
                        dailyCap,
                        auditRateBps
                    )
                    .accounts({
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with account already in use");
            } catch (err: any) {
                console.log("Full error:", JSON.stringify(err, null, 2));
                console.log("Error message:", err.message);
                console.log("Error logs:", err.logs);
                expect(err).to.exist;
                console.log("Correctly prevented reinitialization");
            }
            console.log("\n");
        });

    });

        describe("Org Config Updates", () => {
        it("Successfully updates spending caps", async () => {
            const newPerInvoiceCap = new anchor.BN(2_000_000_000); // 2000 USDC
            const newDailyCap = new anchor.BN(20_000_000_000); // 20,000 USDC

            console.log("\nUpdating spending caps...");

            const tx = await program.methods
                .updateOrgConfig({
                    perInvoiceCap: newPerInvoiceCap,
                    dailyCap: newDailyCap,
                    paused: null,
                    oracleSigner: null,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);

            expect(orgConfig.perInvoiceCap.toString()).to.equal(newPerInvoiceCap.toString());
            expect(orgConfig.dailyCap.toString()).to.equal(newDailyCap.toString());

            console.log("Caps updated successfully!");
            console.log("New Per Invoice Cap:", orgConfig.perInvoiceCap.toString());
            console.log("New Daily Cap:", orgConfig.dailyCap.toString());
            console.log("\n");
        });

        it("Successfully pauses the organization", async () => {
            console.log("\nPausing organization...");

            const tx = await program.methods
                .updateOrgConfig({
                    perInvoiceCap: null,
                    dailyCap: null,
                    paused: true,
                    oracleSigner: null,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);
            expect(orgConfig.paused).to.equal(true);

            console.log("Organization paused!");
            console.log("\n");
        });

        it("Successfully unpauses the organization", async () => {
            console.log("\nUnpausing organization...");

            const tx = await program.methods
                .updateOrgConfig({
                    perInvoiceCap: null,
                    dailyCap: null,
                    paused: false,
                    oracleSigner: null,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);
            expect(orgConfig.paused).to.equal(false);

            console.log("Organization unpaused!");
            console.log("\n");
        });

        it("Successfully updates oracle signer", async () => {
            const newOracleSigner = Keypair.generate().publicKey;

            console.log("\nUpdating oracle signer...");
            console.log("New Oracle Signer:", newOracleSigner.toString());

            const tx = await program.methods
                .updateOrgConfig({
                    perInvoiceCap: null,
                    dailyCap: null,
                    paused: null,
                    oracleSigner: newOracleSigner,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);
            expect(orgConfig.oracleSigner.toString()).to.equal(newOracleSigner.toString());

            console.log("Oracle signer updated!");

            // Restore original oracle signer
            await program.methods
                .updateOrgConfig({
                    perInvoiceCap: null,
                    dailyCap: null,
                    paused: null,
                    oracleSigner: authority.publicKey,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();
            console.log("\n");
        });

        it("Successfully updates multiple fields at once", async () => {
            const newPerInvoiceCap = new anchor.BN(3_000_000_000);
            const newDailyCap = new anchor.BN(30_000_000_000);
            const newOracleSigner = Keypair.generate().publicKey;

            console.log("\nUpdating multiple fields...");

            const tx = await program.methods
                .updateOrgConfig({
                    perInvoiceCap: newPerInvoiceCap,
                    dailyCap: newDailyCap,
                    paused: true,
                    oracleSigner: newOracleSigner,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();

            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);

            expect(orgConfig.perInvoiceCap.toString()).to.equal(newPerInvoiceCap.toString());
            expect(orgConfig.dailyCap.toString()).to.equal(newDailyCap.toString());
            expect(orgConfig.paused).to.equal(true);
            expect(orgConfig.oracleSigner.toString()).to.equal(newOracleSigner.toString());

            console.log("Multiple fields updated successfully!");

            // Restore defaults
            await program.methods
                .updateOrgConfig({
                    perInvoiceCap: perInvoiceCap,
                    dailyCap: dailyCap,
                    paused: false,
                    oracleSigner: authority.publicKey,
                })
                .accounts({
                    authority: authority.publicKey,
                    orgConfig: orgConfigPda,
                })
                .signers([authority])
                .rpc();
            console.log("\n");
        });

        it("Fails to update with invalid caps (daily_cap < per_invoice_cap)", async () => {
            try {
                await program.methods
                    .updateOrgConfig({
                        perInvoiceCap: new anchor.BN(10_000_000_000),
                        dailyCap: new anchor.BN(1_000_000_000), // Less than per_invoice_cap
                        paused: null,
                        oracleSigner: null,
                    })
                    .accounts({
                        authority: authority.publicKey,
                        orgConfig: orgConfigPda,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with CapExceeded error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("CapExceeded");
                console.log("Correctly rejected invalid cap relationship");
            }
            console.log("\n");
        });

        it("Fails to update with zero caps", async () => {
            try {
                await program.methods
                    .updateOrgConfig({
                        perInvoiceCap: new anchor.BN(0),
                        dailyCap: new anchor.BN(0),
                        paused: null,
                        oracleSigner: null,
                    })
                    .accounts({
                        authority: authority.publicKey,
                        orgConfig: orgConfigPda,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with InvalidAmount error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("InvalidAmount");
                console.log("Correctly rejected zero caps");
            }
            console.log("\n");
        });

        it("Fails when unauthorized user tries to update", async () => {
            const unauthorizedUser = Keypair.generate();
            litesvm.setAccount(unauthorizedUser.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            try {
                await program.methods
                    .updateOrgConfig({
                        perInvoiceCap: null,
                        dailyCap: null,
                        paused: true,
                        oracleSigner: null,
                    })
                    .accounts({
                        authority: unauthorizedUser.publicKey,
                        orgConfig: orgConfigPda,
                    })
                    .signers([unauthorizedUser])
                    .rpc();

                expect.fail("Should have failed with Unauthorized error");
            } catch (err) {
                expect(err.error.errorCode.code).to.equal("Unauthorized");
                console.log("Correctly rejected unauthorized update");
            }
            console.log("\n");
        });
    });

    describe("Org Config State Verification", () => {
        it("Verifies complete org config state", async () => {
            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);

            console.log("\nComplete Organization State:");
            console.log("================================");
            console.log("Authority:", orgConfig.authority.toString());
            console.log("Oracle Signer:", orgConfig.oracleSigner.toString());
            console.log("Treasury Vault:", orgConfig.treasuryVault.toString());
            console.log("Mint:", orgConfig.mint.toString());
            console.log("Per Invoice Cap:", orgConfig.perInvoiceCap.toString());
            console.log("Daily Cap:", orgConfig.dailyCap.toString());
            console.log("Daily Spent:", orgConfig.dailySpent.toString());
            console.log("Last Reset Day:", orgConfig.lastResetDay.toString());
            console.log("Audit Rate (bps):", orgConfig.auditRateBps);
            console.log("Paused:", orgConfig.paused);
            console.log("Invoice Counter:", orgConfig.invoiceCounter.toString());
            console.log("Version:", orgConfig.version);
            console.log("Bump:", orgConfig.bump);
            console.log("================================");

            // Verify all fields are properly set
            expect(orgConfig.authority).to.exist;
            expect(orgConfig.oracleSigner).to.exist;
            expect(orgConfig.treasuryVault).to.exist;
            expect(orgConfig.mint).to.exist;
            expect(orgConfig.version).to.equal(1);
            expect(orgConfig.bump).to.be.greaterThan(0);
            console.log("\n");
        });

        it("Verifies PDA derivation matches stored bump", async () => {
            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);

            const [derivedPda, derivedBump] = PublicKey.findProgramAddressSync(
                [Buffer.from("org_config"), authority.publicKey.toBuffer()],
                program.programId
            );

            expect(derivedPda.toString()).to.equal(orgConfigPda.toString());
            expect(derivedBump).to.equal(orgConfig.bump);

            console.log("PDA derivation verified!");
            console.log("Canonical bump:", derivedBump);
            console.log("\n");
        });
    });
});
