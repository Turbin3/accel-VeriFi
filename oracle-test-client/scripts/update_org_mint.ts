import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.InvoiceClaim as any;

    const authority = provider.wallet.publicKey;
    const correctMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

    const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        program.programId
    );

    console.log("Updating org config mint to:", correctMint.toBase58());

    const tx = await program.methods
        .updateOrgConfig({
            oracleSigner: null,
            perInvoiceCap: null,
            dailyCap: null,
            paused: null,
            mint: correctMint,  // Update mint
        })
        .accounts({
            orgConfig: orgConfigPda,
            authority: authority,
        })
        .rpc();

    console.log("Mint updated! TX:", tx);

    // Verify
    const orgConfig = await program.account.orgConfig.fetch(orgConfigPda);
    console.log("\nUpdated OrgConfig mint:", orgConfig.mint.toBase58());
}

main();
