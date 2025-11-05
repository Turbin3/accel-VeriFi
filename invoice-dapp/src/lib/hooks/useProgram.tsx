/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import IDL from "../../invoice_claim.json";

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey) return null;

    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });

    return new Program(IDL, provider);
  }, [connection, wallet]);
}
