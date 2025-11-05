/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from "buffer";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import IDL from "../../invoice_claim.json";

interface SetupPageProps {
  onComplete: () => void;
}

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);

// Solana Devnet USDC Mint
const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgZwtzFEXALfdSoJ81puuwnji5"
);

export function SetupPage({ onComplete }: SetupPageProps) {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  // Parameter states
  const [treasuryVault, setTreasuryVault] = useState<string>("");
  const [mint, setMint] = useState<string>(USDC_MINT_DEVNET.toBase58());
  const [perInvoiceCap, setPerInvoiceCap] = useState<string>("1000000000");
  const [dailyCap, setDailyCap] = useState<string>("10000000000");
  const [auditRateBps, setAuditRateBps] = useState<string>("500");

  const { connection } = useConnection();
  const wallet = useWallet();

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  // Derive USDC ATA on wallet connection
  const deriveTreasuryVault = async () => {
    if (!wallet.publicKey) return;

    try {
      const ata = await getAssociatedTokenAddress(
        USDC_MINT_DEVNET,
        wallet.publicKey
      );
      setTreasuryVault(ata.toBase58());
    } catch (err) {
      console.error("Error deriving ATA:", err);
      setError("Failed to derive USDC ATA");
    }
  };

  // Derive treasury vault when wallet connects
  const handleWalletConnect = async () => {
    await deriveTreasuryVault();
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      setError("Organization name is required");
      return;
    }

    if (
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    ) {
      setError("Please connect your wallet first");
      return;
    }

    if (!treasuryVault) {
      setError("Treasury vault not derived. Please reconnect wallet.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Validate inputs
      const perInvoiceCapBN = new BN(perInvoiceCap);
      const dailyCapBN = new BN(dailyCap);
      const auditRateBpsNum = parseInt(auditRateBps);

      if (perInvoiceCapBN.isNeg() || dailyCapBN.isNeg()) {
        throw new Error("Caps cannot be negative");
      }

      if (auditRateBpsNum < 0 || auditRateBpsNum > 10000) {
        throw new Error("Audit rate must be between 0 and 10000 basis points");
      }

      // Create provider
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      // Create program instance
      const program = new Program(IDL, provider);

      // Authority is the wallet's public key
      const authority = wallet.publicKey;

      // Derive org config PDA
      const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        PROGRAM_ID
      );

      console.log("Creating org with parameters:", {
        orgConfigPda: orgConfigPda.toBase58(),
        authority: authority.toBase58(),
        treasuryVault,
        mint,
        perInvoiceCap: perInvoiceCapBN.toString(),
        dailyCap: dailyCapBN.toString(),
        auditRateBps: auditRateBpsNum,
      });

      // Call orgInit
      const tx = await program.methods
        .orgInit(
          new PublicKey(treasuryVault),
          new PublicKey(mint),
          perInvoiceCapBN,
          dailyCapBN,
          auditRateBpsNum
        )
        .accounts({
          orgConfig: orgConfigPda,
          authority,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction successful:", tx);
      setTxHash(tx);
      setStep(2);
    } catch (err: any) {
      console.error("Full error:", err);
      if (err.logs) {
        console.error("Program logs:", err.logs);
      }
      setError(err.message || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  // Trigger treasury derivation when wallet connects
  if (wallet.publicKey && !treasuryVault) {
    handleWalletConnect();
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <motion.div
        className="w-full max-w-3xl"
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        {step === 1 && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-12 shadow-2xl">
            {/* Progress */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-emerald-400">
                  Step 1 of 3
                </span>
                <div className="w-32 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-gradient-to-r from-emerald-500 to-green-600 rounded-full" />
                </div>
              </div>
            </div>

            {/* Content */}
            <h1 className="text-4xl font-bold text-white mb-4">
              Create Your Organization
            </h1>
            <p className="text-slate-400 text-lg mb-8">
              Set up your VeriFi organization on Solana blockchain.
            </p>

            {/* Wallet Status */}
            <div className="mb-6 p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
              <p className="text-sm text-slate-300">
                <strong>Wallet:</strong>{" "}
                {wallet.publicKey ? (
                  <span className="text-emerald-400 font-mono">
                    {wallet.publicKey.toBase58().slice(0, 10)}...
                    {wallet.publicKey.toBase58().slice(-10)}
                  </span>
                ) : (
                  <span className="text-red-400">Not connected</span>
                )}
              </p>
            </div>

            {/* Form */}
            <div className="space-y-6">
              {/* Organization Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    setError("");
                  }}
                  placeholder="e.g., Acme Corporation"
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  disabled={loading || !wallet.publicKey}
                />
                <p className="text-sm text-slate-500 mt-2">
                  Your organization's unique identifier
                </p>
              </div>

              {/* Configuration Fields */}
              <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">
                  Organization Configuration
                </h3>

                {/* Treasury Vault */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Treasury Vault (USDC ATA)
                  </label>
                  <div className="px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-xs font-mono break-all">
                    {treasuryVault || "Deriving..."}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Auto-derived from your wallet's USDC associated token
                    account
                  </p>
                </div>

                {/* Mint */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Payment Mint
                  </label>
                  <input
                    type="text"
                    value={mint}
                    onChange={(e) => setMint(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-xs font-mono"
                    disabled={loading}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Devnet USDC mint by default
                  </p>
                </div>

                {/* Per Invoice Cap */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Per Invoice Cap (base units)
                  </label>
                  <input
                    type="number"
                    value={perInvoiceCap}
                    onChange={(e) => setPerInvoiceCap(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    disabled={loading}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Max amount per single invoice (currently: {perInvoiceCap})
                  </p>
                </div>

                {/* Daily Cap */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Daily Cap (base units)
                  </label>
                  <input
                    type="number"
                    value={dailyCap}
                    onChange={(e) => setDailyCap(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    disabled={loading}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Max total amount per day (currently: {dailyCap})
                  </p>
                </div>

                {/* Audit Rate */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Audit Rate (basis points)
                  </label>
                  <div className="flex gap-4 items-end">
                    <input
                      type="number"
                      value={auditRateBps}
                      onChange={(e) => setAuditRateBps(e.target.value)}
                      min="0"
                      max="10000"
                      className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                      disabled={loading}
                    />
                    <span className="text-sm text-emerald-400 font-semibold">
                      {(parseInt(auditRateBps) / 100).toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    0-10000 bps (0-100%). Invoices randomly sampled for VRF
                    audit at this rate.
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <motion.button
                onClick={handleCreateOrg}
                disabled={loading || !wallet.publicKey || !treasuryVault}
                className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Creating Organization on Solana...
                  </>
                ) : !wallet.publicKey ? (
                  <>
                    <span>Please Connect Wallet</span>
                  </>
                ) : !treasuryVault ? (
                  <>
                    <span>Deriving Treasury Vault...</span>
                  </>
                ) : (
                  <>
                    Create Organization
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>

            {/* Info Box */}
            <div className="mt-8 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-sm text-emerald-400">
                💡 <strong>Tip:</strong> This will invoke the `orgInit`
                instruction on your Solana program with the configuration shown
                above.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-12 shadow-2xl text-center">
            {/* Progress */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-emerald-400">
                  Step 2 of 3
                </span>
                <div className="w-32 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-gradient-to-r from-emerald-500 to-green-600 rounded-full" />
                </div>
              </div>
            </div>

            <motion.div
              className="mb-8"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center">
                <span className="text-4xl">✅</span>
              </div>
            </motion.div>

            <h2 className="text-3xl font-bold text-white mb-4">
              Organization Created!
            </h2>
            <p className="text-slate-400 text-lg mb-6">
              {orgName} has been successfully created on Solana blockchain.
            </p>

            {/* Transaction Hash */}
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-8 text-left">
              <p className="text-xs text-slate-400 mb-2">Transaction Hash:</p>
              <p className="text-xs text-emerald-400 font-mono break-all">
                {txHash}
              </p>
            </div>

            <motion.button
              onClick={onComplete}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-green-700 flex items-center justify-center gap-2 mx-auto"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                📊 <strong>Next:</strong> Manage vendors and invoices from your
                admin dashboard.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
