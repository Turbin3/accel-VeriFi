import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  return (
    <div className="flex items-center gap-4">
      <WalletMultiButton />
    </div>
  );
}
