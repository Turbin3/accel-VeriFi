import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

// Default styles for wallet adapter
import "@solana/wallet-adapter-react-ui/styles.css";

export const useSolanaWallet = (
  network: WalletAdapterNetwork = WalletAdapterNetwork.Devnet
) => {
  // Set the network, using devnet as default
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  // Custom hook returns JSX wrapping the component tree with the necessary providers
  return function SolanaWalletProvider({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    );
  };
};
