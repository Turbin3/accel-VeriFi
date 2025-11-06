import * as anchor from "@coral-xyz/anchor";

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = (anchor.workspace as any).InvoiceClaim as any;
    const wallet = provider.wallet as any;

    // Hardcoded constants
    const ORG_AUTHORITY = new anchor.web3.PublicKey("BytFyQcJjBVSH6gARHCixGFa4wca1K3zERKGf3ZGCQVt");
    const NEW_ORACLE_SIGNER = new anchor.web3.PublicKey("DM3f2K7pEAsXdXDSmUjoHVAepzxeG6dzDBZjDVPuXVkM");

    const [orgConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), ORG_AUTHORITY.toBuffer()],
        program.programId
    );

    console.log("Updating org_config");
    console.log("Program ID:", program.programId.toBase58());
    console.log("Org Config PDA:", orgConfigPda.toBase58());
    console.log("Signing as:", wallet.publicKey.toBase58());
    console.log("New Oracle Signer:", NEW_ORACLE_SIGNER.toBase58());

    // Construct args for update_org_config
    const args = {
        perInvoiceCap: null,
        dailyCap: null,
        paused: null,
        oracleSigner: NEW_ORACLE_SIGNER,
        mint: null,
    };

    try {
        const tx = await program.methods
            .updateOrgConfig(args)
            .accounts({
                authority: wallet.publicKey, // must be org authority
                orgConfig: orgConfigPda,
            })
            .rpc();

        console.log("Update successful!");
        console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (e: any) {
        console.error("Update failed:", e.message || e);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
