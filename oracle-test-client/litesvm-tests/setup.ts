import { AnchorError, Program } from "@coral-xyz/anchor";
import { InvoiceClaim } from "../target/types/invoice_claim";
import idl from "../target/idl/invoice_claim.json";
import {
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Keypair
} from "@solana/web3.js";
import { AccountInfoBytes, ComputeBudget } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import { expect } from "chai";
import {
    TOKEN_PROGRAM_ID,
    createMint,
    createAccount,
    mintTo,
    getAccount
} from "@solana/spl-token";

export async function getSetup(
    accounts: { pubkey: PublicKey; account: AccountInfoBytes }[] = []
) {
    const litesvm = fromWorkspace("./");
    litesvm.withLogBytesLimit(null);

    const computeBudget = new ComputeBudget();
    computeBudget.computeUnitLimit = 400_000n;
    litesvm.withComputeBudget(computeBudget);

    for (const { pubkey, account } of accounts) {
        litesvm.setAccount(new PublicKey(pubkey), {
            data: account.data,
            executable: account.executable,
            lamports: account.lamports,
            owner: new PublicKey(account.owner),
        });
    }

    const provider = new LiteSVMProvider(litesvm);
    const program = new Program<InvoiceClaim>(idl, provider);

    return { litesvm, provider, program };
}

export function fundedSystemAccountInfo(
    lamports: number = LAMPORTS_PER_SOL
): AccountInfoBytes {
    return {
        lamports,
        data: Buffer.alloc(0),
        owner: SystemProgram.programId,
        executable: false,
    };
}

export async function expectAnchorError(error: Error, code: string) {
    expect(error).toBeInstanceOf(AnchorError);
    const { errorCode } = (error as AnchorError).error;
    expect(errorCode.code).toBe(code);
}

// Helper to derive invoice PDA
export function getInvoicePda(
    program: Program<InvoiceClaim>,
    company: PublicKey,
    invoiceId: string
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("invoice"), company.toBuffer(), Buffer.from(invoiceId)],
        program.programId
    );
}

// Helper to derive extraction request PDA
export function getExtractionRequestPda(
    program: Program<InvoiceClaim>,
    invoice: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("extraction_request"), invoice.toBuffer()],
        program.programId
    );
}

// Helper to derive org config PDA
export function getOrgConfigPda(
    program: Program<InvoiceClaim>,
    company: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), company.toBuffer()],
        program.programId
    );
}

// Helper to derive vendor PDA
export function getVendorPda(
    program: Program<InvoiceClaim>,
    company: PublicKey,
    vendorName: string
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("vendor"), company.toBuffer(), Buffer.from(vendorName)],
        program.programId
    );
}

// Helper to derive escrow PDA
export function getEscrowPda(
    program: Program<InvoiceClaim>,
    invoice: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), invoice.toBuffer()],
        program.programId
    );
}

// Helper to create a test org with token mint and treasury
export async function setupTestOrg(
    provider: LiteSVMProvider,
    program: Program<InvoiceClaim>,
    company: Keypair,
    perInvoiceCap: number = 10_000,
    dailyCap: number = 100_000,
    auditRateBps: number = 1000 // 10%
) {
    // Create mint
    const mint = await createMint(
        provider,
        company,
        company.publicKey,
        null,
        6
    );

    // Create treasury vault
    const treasuryVault = await createAccount(
        provider,
        company,
        mint,
        company.publicKey
    );

    // Mint some tokens to treasury
    await mintTo(
        provider,
        company,
        mint,
        treasuryVault,
        company,
        dailyCap * 10 // Fund with 10x daily cap
    );

    const [orgConfig] = getOrgConfigPda(program, company.publicKey);

    await program.methods
        .orgInit(
            treasuryVault,
            mint,
            perInvoiceCap,
            dailyCap,
            auditRateBps
        )
        .accounts({
            company: company.publicKey,
            orgConfig,
            systemProgram: SystemProgram.programId,
        })
        .signers([company])
        .rpc();

    return { mint, treasuryVault, orgConfig };
}

// Helper to register a test vendor
export async function setupTestVendor(
    program: Program<InvoiceClaim>,
    company: Keypair,
    vendorName: string,
    vendorWallet: PublicKey
) {
    const [vendorPda] = getVendorPda(program, company.publicKey, vendorName);
    const [orgConfig] = getOrgConfigPda(program, company.publicKey);

    await program.methods
        .registerVendor(vendorName, vendorWallet)
        .accounts({
            company: company.publicKey,
            orgConfig,
            vendor: vendorPda,
            systemProgram: SystemProgram.programId,
        })
        .signers([company])
        .rpc();

    return vendorPda;
}

// Constants for your program
export const CALLBACK_VRF_DISCRIMINATOR = Buffer.from("clbrand");
