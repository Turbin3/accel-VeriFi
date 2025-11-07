import * as anchor from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).InvoiceClaim as any;
  const wallet = provider.wallet as any;

  const authStr = process.env.AUTH_PUBKEY || wallet.publicKey.toBase58();
  const nonceStr = process.env.NONCE || `${Date.now()}`;
  const auth = new anchor.web3.PublicKey(authStr);
  const nonce = new anchor.BN(nonceStr);
  const nonceLe = Buffer.from(nonce.toArray("le", 8));

  const [legacyReq] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("request"), auth.toBuffer()],
    program.programId
  );
  const [newReq] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("request"), auth.toBuffer(), nonceLe],
    program.programId
  );

  console.log("Program ID:", program.programId.toBase58());
  console.log("Authority:", auth.toBase58());
  console.log("Nonce:", nonce.toString());
  console.log("Nonce LE bytes:", Buffer.from(nonceLe).toString("hex"));
  console.log("Legacy request PDA:", legacyReq.toBase58());
  console.log("New request PDA (with nonce):", newReq.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

