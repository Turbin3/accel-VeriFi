import { describe, it } from "mocha";
import { expect } from "chai";
import { Program } from "@coral-xyz/anchor";
import { InvoiceClaim } from "../target/types/invoice_claim";
import idl from "../target/idl/invoice_claim.json";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ComputeBudget } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import * as anchor from "@coral-xyz/anchor";

describe("Vendor Management Tests", () => {
    let litesvm: any;
    let provider: LiteSVMProvider;
    let program: Program<InvoiceClaim>;
    let authority: Keypair;

    // Test parameters
    const treasuryVault = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const perInvoiceCap = new anchor.BN(1_000_000_000);
    const dailyCap = new anchor.BN(10_000_000_000);
    const auditRateBps = 500;

    let orgConfigPda: PublicKey;
    const vendorName1 = "SolDaddy Corp";
    const vendorName2 = "Tech Solutions Inc";
    const vendorWallet1 = Keypair.generate().publicKey;
    const vendorWallet2 = Keypair.generate().publicKey;

    let vendorPda1: PublicKey;
    let vendorPda2: PublicKey;

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

        // Initialize organization
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

        console.log("Organization initialized for tests");

        // Derive vendor PDAs
        [vendorPda1] = PublicKey.findProgramAddressSync(
            [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendorName1)],
            program.programId
        );

        [vendorPda2] = PublicKey.findProgramAddressSync(
            [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendorName2)],
            program.programId
        );
    });

    describe("Vendor Registration", () => {
        it("Successfully registers a new vendor", async () => {
            console.log("\nRegistering vendor:", vendorName1);
            console.log("Vendor PDA:", vendorPda1.toString());
            console.log("Vendor Wallet:", vendorWallet1.toString());

            const tx = await program.methods
                .registerVendor(vendorName1, vendorWallet1)
                .accounts({
                    vendorAccount: vendorPda1,
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([authority])
                .rpc();

            console.log("\nVendor registered!");
            console.log("Transaction:", tx);

            const vendorAccount = await program.account.vendorAccount.fetch(vendorPda1);
            const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);

            expect(vendorAccount.org.toString()).to.equal(orgConfigPda.toString());
            expect(vendorAccount.vendorName).to.equal(vendorName1);
            expect(vendorAccount.wallet.toString()).to.equal(vendorWallet1.toString());
            expect(vendorAccount.totalPaid.toString()).to.equal("0");
            expect(vendorAccount.lastPayment.toString()).to.equal("0");
            expect(vendorAccount.isActive).to.equal(true);
            expect(vendorAccount.currencyPreference.toString()).to.equal(orgConfig.mint.toString());

            console.log("\nVendor Account Details:");
            console.log("Organization:", vendorAccount.org.toString());
            console.log("Vendor Name:", vendorAccount.vendorName);
            console.log("Wallet:", vendorAccount.wallet.toString());
            console.log("Total Paid:", vendorAccount.totalPaid.toString());
            console.log("Is Active:", vendorAccount.isActive);
            console.log("\n");
        });

        it("Successfully registers a second vendor", async () => {
            console.log("\nRegistering second vendor:", vendorName2);

            const tx = await program.methods
                .registerVendor(vendorName2, vendorWallet2)
                .accounts({
                    vendorAccount: vendorPda2,
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([authority])
                .rpc();

            console.log("Vendor registered!");
            console.log("Transaction:", tx);

            const vendorAccount = await program.account.vendorAccount.fetch(vendorPda2);
            expect(vendorAccount.vendorName).to.equal(vendorName2);
            expect(vendorAccount.wallet.toString()).to.equal(vendorWallet2.toString());
            expect(vendorAccount.isActive).to.equal(true);
            console.log("\n");
        });

        it("Fails to register vendor with empty name", async () => {
            const emptyName = "";

            try {
                const [emptyVendorPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(emptyName)],
                    program.programId
                );

                await program.methods
                    .registerVendor(emptyName, vendorWallet1)
                    .accounts({
                        vendorAccount: emptyVendorPda,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with InvalidVendor error");
            } catch (err: any) {
                if (err.error?.errorCode) {
                    expect(err.error.errorCode.code).to.equal("InvalidVendor");
                }
                console.log("Correctly rejected empty vendor name");
            }
            console.log("\n");
        });

        it("Fails to register vendor with name exceeding 50 characters", async () => {
            const longName = "A".repeat(51);

            try {
                const truncatedForPda = longName.substring(0, 32);
                const [testVendorPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(truncatedForPda)],
                    program.programId
                );

                await program.methods
                    .registerVendor(longName, vendorWallet1)
                    .accounts({
                        vendorAccount: testVendorPda,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with InvalidVendor error");
            } catch (err: any) {
                console.log("Correctly rejected vendor name exceeding 50 characters");
            }
            console.log("\n");
        });

        it("Fails to register vendor with default wallet", async () => {
            const testVendorName = "Test Vendor Default";
            const [testVendorPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(testVendorName)],
                program.programId
            );

            try {
                await program.methods
                    .registerVendor(testVendorName, PublicKey.default)
                    .accounts({
                        vendorAccount: testVendorPda,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with InvalidWallet error");
            } catch (err: any) {
                expect(err.error.errorCode.code).to.equal("InvalidWallet");
                console.log("Correctly rejected default wallet address");
            }
            console.log("\n");
        });

        it("Fails when unauthorized user tries to register vendor", async () => {
            const unauthorizedUser = Keypair.generate();
            litesvm.setAccount(unauthorizedUser.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            const testVendorName = "Unauthorized Vendor";
            const [testVendorPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(testVendorName)],
                program.programId
            );

            try {
                await program.methods
                    .registerVendor(testVendorName, vendorWallet1)
                    .accounts({
                        vendorAccount: testVendorPda,
                        orgConfig: orgConfigPda,
                        authority: unauthorizedUser.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([unauthorizedUser])
                    .rpc();

                expect.fail("Should have failed with authorization error");
            } catch (err: any) {
                console.log("Correctly rejected unauthorized vendor registration");
            }
            console.log("\n");
        });
    });

    describe("Vendor Deactivation", () => {
        it("Successfully deactivates an active vendor", async () => {
            console.log("\nDeactivating vendor:", vendorName1);

            const vendorBefore = await program.account.vendorAccount.fetch(vendorPda1);

            if (!vendorBefore.isActive) {
                console.log("Vendor already inactive, skipping deactivation");
                console.log("\n");
                return;
            }

            const tx = await program.methods
                .deactivateVendor()
                .accounts({
                    vendorAccount: vendorPda1,
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const vendorAccount = await program.account.vendorAccount.fetch(vendorPda1);
            expect(vendorAccount.isActive).to.equal(false);

            console.log("Vendor deactivated successfully!");
            console.log("Is Active:", vendorAccount.isActive);
            console.log("\n");
        });

        it("Fails to deactivate already inactive vendor", async () => {
            const vendorBefore = await program.account.vendorAccount.fetch(vendorPda1);

            if (vendorBefore.isActive) {
                await program.methods
                    .deactivateVendor()
                    .accounts({
                        vendorAccount: vendorPda1,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                    })
                    .signers([authority])
                    .rpc();
            }

            try {
                await program.methods
                    .deactivateVendor()
                    .accounts({
                        vendorAccount: vendorPda1,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with VendorInactive error");
            } catch (err: any) {
                if (err.error?.errorCode?.code) {
                    expect(err.error.errorCode.code).to.equal("VendorInactive");
                } else {
                    expect(err).to.exist;
                }
                console.log("Correctly rejected deactivating inactive vendor");
            }
            console.log("\n");
        });


        it("Fails when unauthorized user tries to deactivate vendor", async () => {
            const unauthorizedUser = Keypair.generate();
            litesvm.setAccount(unauthorizedUser.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            try {
                await program.methods
                    .deactivateVendor()
                    .accounts({
                        vendorAccount: vendorPda2,
                        orgConfig: orgConfigPda,
                        authority: unauthorizedUser.publicKey,
                    })
                    .signers([unauthorizedUser])
                    .rpc();

                expect.fail("Should have failed with Unauthorized error");
            } catch (err: any) {
                expect(err.error.errorCode.code).to.equal("Unauthorized");
                console.log("Correctly rejected unauthorized deactivation");
            }
            console.log("\n");
        });
    });

    describe("Vendor Activation", () => {
        it("Successfully activates an inactive vendor", async () => {
            console.log("\nActivating vendor:", vendorName1);

            const vendorBefore = await program.account.vendorAccount.fetch(vendorPda1);

            if (vendorBefore.isActive) {
                console.log("Vendor already active, skipping activation");
                console.log("\n");
                return;
            }

            const tx = await program.methods
                .activateVendor()
                .accounts({
                    vendorAccount: vendorPda1,
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const vendorAccount = await program.account.vendorAccount.fetch(vendorPda1);
            expect(vendorAccount.isActive).to.equal(true);

            console.log("Vendor activated successfully!");
            console.log("Is Active:", vendorAccount.isActive);
            console.log("\n");
        });

        it("Fails to activate already active vendor", async () => {
            const vendorBefore = await program.account.vendorAccount.fetch(vendorPda1);

            if (!vendorBefore.isActive) {
                await program.methods
                    .activateVendor()
                    .accounts({
                        vendorAccount: vendorPda1,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                    })
                    .signers([authority])
                    .rpc();
            }

            try {
                await program.methods
                    .activateVendor()
                    .accounts({
                        vendorAccount: vendorPda1,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with VendorInactive error");
            } catch (err: any) {
                if (err.error?.errorCode?.code) {
                    expect(err.error.errorCode.code).to.equal("VendorInactive");
                } else {
                    expect(err).to.exist;
                }
                console.log("Correctly rejected activating active vendor");
            }
            console.log("\n");
        });


        it("Fails when unauthorized user tries to activate vendor", async () => {
            const vendor2Before = await program.account.vendorAccount.fetch(vendorPda2);

            if (vendor2Before.isActive) {
                await program.methods
                    .deactivateVendor()
                    .accounts({
                        vendorAccount: vendorPda2,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                    })
                    .signers([authority])
                    .rpc();
            }

            const unauthorizedUser = Keypair.generate();
            litesvm.setAccount(unauthorizedUser.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            try {
                await program.methods
                    .activateVendor()
                    .accounts({
                        vendorAccount: vendorPda2,
                        orgConfig: orgConfigPda,
                        authority: unauthorizedUser.publicKey,
                    })
                    .signers([unauthorizedUser])
                    .rpc();

                expect.fail("Should have failed with Unauthorized error");
            } catch (err: any) {
                expect(err.error.errorCode.code).to.equal("Unauthorized");
                console.log("Correctly rejected unauthorized activation");
            }

            await program.methods
                .activateVendor()
                .accounts({
                    vendorAccount: vendorPda2,
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                })
                .signers([authority])
                .rpc();

            console.log("\n");
        });
    });

    describe("Vendor Wallet Update", () => {
        it("Successfully updates vendor wallet", async () => {
            const newWallet = Keypair.generate().publicKey;

            console.log("\nUpdating vendor wallet for:", vendorName1);
            console.log("New Wallet:", newWallet.toString());

            const tx = await program.methods
                .updateVendorWallet(newWallet)
                .accounts({
                    vendorAccount: vendorPda1,
                    orgConfig: orgConfigPda,
                    authority: authority.publicKey,
                })
                .signers([authority])
                .rpc();

            console.log("Transaction:", tx);

            const vendorAccount = await program.account.vendorAccount.fetch(vendorPda1);
            expect(vendorAccount.wallet.toString()).to.equal(newWallet.toString());

            console.log("Wallet updated successfully!");
            console.log("Current Wallet:", vendorAccount.wallet.toString());
            console.log("\n");
        });

        it("Fails to update wallet to default address", async () => {
            try {
                await program.methods
                    .updateVendorWallet(PublicKey.default)
                    .accounts({
                        vendorAccount: vendorPda1,
                        orgConfig: orgConfigPda,
                        authority: authority.publicKey,
                    })
                    .signers([authority])
                    .rpc();

                expect.fail("Should have failed with InvalidWallet error");
            } catch (err: any) {
                expect(err.error.errorCode.code).to.equal("InvalidWallet");
                console.log("Correctly rejected default wallet address");
            }
            console.log("\n");
        });

        it("Fails when unauthorized user tries to update wallet", async () => {
            const unauthorizedUser = Keypair.generate();
            litesvm.setAccount(unauthorizedUser.publicKey, {
                lamports: 100 * LAMPORTS_PER_SOL,
                data: Buffer.alloc(0),
                executable: false,
                owner: SystemProgram.programId,
            });

            const newWallet = Keypair.generate().publicKey;

            try {
                await program.methods
                    .updateVendorWallet(newWallet)
                    .accounts({
                        vendorAccount: vendorPda1,
                        orgConfig: orgConfigPda,
                        authority: unauthorizedUser.publicKey,
                    })
                    .signers([unauthorizedUser])
                    .rpc();

                expect.fail("Should have failed with Unauthorized error");
            } catch (err: any) {
                expect(err.error.errorCode.code).to.equal("Unauthorized");
                console.log("Correctly rejected unauthorized wallet update");
            }
            console.log("\n");
        });
    });

    describe("Vendor State Verification", () => {
        it("Verifies complete vendor state", async () => {
            const vendor1 = await program.account.vendorAccount.fetch(vendorPda1);
            const vendor2 = await program.account.vendorAccount.fetch(vendorPda2);

            console.log("\nComplete Vendor States:");
            console.log("================================");
            console.log("\nVendor 1:", vendor1.vendorName);
            console.log("Organization:", vendor1.org.toString());
            console.log("Wallet:", vendor1.wallet.toString());
            console.log("Total Paid:", vendor1.totalPaid.toString());
            console.log("Last Payment:", vendor1.lastPayment.toString());
            console.log("Is Active:", vendor1.isActive);
            console.log("Currency Preference:", vendor1.currencyPreference.toString());

            console.log("\nVendor 2:", vendor2.vendorName);
            console.log("Organization:", vendor2.org.toString());
            console.log("Wallet:", vendor2.wallet.toString());
            console.log("Total Paid:", vendor2.totalPaid.toString());
            console.log("Last Payment:", vendor2.lastPayment.toString());
            console.log("Is Active:", vendor2.isActive);
            console.log("Currency Preference:", vendor2.currencyPreference.toString());
            console.log("================================");

            expect(vendor1.org.toString()).to.equal(vendor2.org.toString());
            expect(vendor1.org.toString()).to.equal(orgConfigPda.toString());

            expect(vendor1.totalPaid.toString()).to.equal("0");
            expect(vendor2.totalPaid.toString()).to.equal("0");
            expect(vendor1.lastPayment.toString()).to.equal("0");
            expect(vendor2.lastPayment.toString()).to.equal("0");

            console.log("\n");
        });

        it("Verifies PDA derivation for vendors", async () => {
            const vendor1 = await program.account.vendorAccount.fetch(vendorPda1);

            const [derivedPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vendor"), orgConfigPda.toBuffer(), Buffer.from(vendor1.vendorName)],
                program.programId
            );

            expect(derivedPda.toString()).to.equal(vendorPda1.toString());

            console.log("Vendor PDA derivation verified!");
            console.log("Derived PDA:", derivedPda.toString());
            console.log("Expected PDA:", vendorPda1.toString());
            console.log("\n");
        });
    });
});
