import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";

async function main() {
  // === 1️⃣ Load your custom wallet ===
  const walletPath = "/home/mrb1nary/Capstone/oracle-test-client/scripts/phantom-keypair.json";
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));

  // === 2️⃣ Setup provider manually ===
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // === 3️⃣ Get program reference ===
  const program = (anchor.workspace as any).InvoiceClaim as anchor.Program;
  const authority = wallet.publicKey;

  // === 4️⃣ Derive PDAs ===
  const [orgConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("org_config"), authority.toBuffer()],
      program.programId
  );

  const [paymentQueuePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment_queue"), orgConfigPda.toBuffer()],
      program.programId
  );

  console.log("Initializing PaymentQueue...");
  console.log("Authority:", authority.toBase58());
  console.log("OrgConfig PDA:", orgConfigPda.toBase58());
  console.log("PaymentQueue PDA:", paymentQueuePda.toBase58());

  // === 5️⃣ Send transaction ===
  try {
    const tx = await program.methods
        .initPaymentQueue()
        .accounts({
          authority,
          orgConfig: orgConfigPda,
          paymentQueue: paymentQueuePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair]) // 👈 use your wallet explicitly
        .rpc();

    console.log("✅ PaymentQueue initialized successfully!");
    console.log("Transaction signature:", tx);
  } catch (e: any) {
    console.error("❌ Init payment queue failed:", e.message || e);
    process.exit(1);
  }
}

main();
