import { PublicKey } from "@solana/web3.js";
const PROGRAM_ID = new PublicKey("HQ5y6ZMwNHSrRvma4bDHtay4UDW5qBM63A5mvyGi4MkH");
const AUTH = new PublicKey("Eup2h4GgBf9HTrCLdkeJndmKLfkfLPf4BYZu7oaAkzNU");
const nonce = 1762671968592;
const nonceLe = Buffer.alloc(8);
nonceLe.writeUInt32LE(nonce % 0x100000000, 0);
nonceLe.writeUInt32LE(Math.floor(nonce / 0x100000000), 4);

const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("invoice"), AUTH.toBuffer(), nonceLe],
    PROGRAM_ID
);
console.log(pda.toBase58());
