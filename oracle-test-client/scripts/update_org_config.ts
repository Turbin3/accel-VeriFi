// update-oracle-signer.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.InvoiceClaim as any;

    const authority = provider.wallet.publicKey;

    // Your oracle keypair public key (from error log)
    const newOracleSigner = new PublicKey("FFuMssLXAgynjrXsGEmq3pr4oSVpbHnceyWN9LDwwvPS");

    const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        program.programId
    );

    console.log("Updating oracle signer to:", newOracleSigner.toBase58());

    const tx = await program.methods
        .updateOrgConfig({
            oracleSigner: newOracleSigner,
            perInvoiceCap: null,
            dailyCap: null,
            paused: null,
            mint: null,
        })
        .accounts({
            orgConfig: orgConfigPda,
            authority: authority,
        })
        .rpc();

    console.log("✅ Oracle signer updated!");
    console.log("TX:", tx);
}

main();
