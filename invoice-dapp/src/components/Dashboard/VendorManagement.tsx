/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// VendorManagement.tsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Users,
  CheckCircle,
  XCircle,
  Loader,
  Edit2,
  Power,
  RotateCw,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Buffer } from "buffer";
import IDL from "../../invoice_claim.json";

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);

interface Vendor {
  name: string;
  wallet: string;
  isActive: boolean;
  totalPaid: number;
  lastPayment: number;
}

export function VendorManagement() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddVendor, setShowAddVendor] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorWallet, setNewVendorWallet] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [actionLoading, setActionLoading] = useState<string>("");

  const { connection } = useConnection();
  const wallet = useWallet();

  useEffect(() => {
    if (wallet.publicKey) {
      fetchVendors();
    }
  }, [wallet.publicKey]);

  const fetchVendors = async () => {
    if (!wallet.publicKey) return;

    setLoading(true);
    setError("");

    try {
      

      const authority = wallet.publicKey;

      // Derive org config PDA
      const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        PROGRAM_ID
      );

      // Fetch all program accounts
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);

      // Filter and decode vendor accounts
      const fetchedVendors: Vendor[] = [];
      const vendorDiscriminator = Buffer.from([
        195, 199, 157, 136, 32, 253, 194, 7,
      ]);
      const orgBuffer = orgConfigPda.toBuffer();

      for (const { account } of allAccounts) {
        try {
          if (account.data.length < 50) continue;

          const discriminator = account.data.slice(0, 8);
          if (!discriminator.equals(vendorDiscriminator)) continue;

          const orgField = account.data.slice(8, 40);
          if (!orgField.equals(orgBuffer)) continue;

          let offset = 40;

          const vendorNameLen = account.data.readUInt32LE(offset);
          offset += 4;

          if (offset + vendorNameLen > account.data.length) continue;
          const vendor_name = account.data
            .slice(offset, offset + vendorNameLen)
            .toString();
          offset += vendorNameLen;

          if (offset + 32 > account.data.length) continue;
          const wallet_pubkey = new PublicKey(
            account.data.slice(offset, offset + 32)
          );
          offset += 32;

          if (offset + 8 > account.data.length) continue;
          const total_paid = account.data.readBigUInt64LE(offset);
          offset += 8;

          if (offset + 8 > account.data.length) continue;
          const last_payment = account.data.readBigInt64LE(offset);
          offset += 8;

          if (offset + 1 > account.data.length) continue;
          const is_active = account.data[offset] !== 0;

          fetchedVendors.push({
            name: vendor_name,
            wallet: wallet_pubkey.toBase58(),
            isActive: is_active,
            totalPaid: Number(total_paid),
            lastPayment: Number(last_payment),
          });
        } catch (err) {
          continue;
        }
      }

      setVendors(fetchedVendors);
    } catch (err: any) {
      console.error("Error fetching vendors:", err);
      setError("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = async () => {
    if (!newVendorName.trim() || !newVendorWallet.trim()) {
      setError("Please fill in all fields");
      return;
    }

    let vendorWalletPubkey: PublicKey;
    try {
      vendorWalletPubkey = new PublicKey(newVendorWallet);
    } catch (err) {
      setError("Invalid Solana wallet address");
      return;
    }

    setAddingVendor(true);

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      const program = new Program(IDL, provider);
      const authority = wallet.publicKey!;

      const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        PROGRAM_ID
      );

      const [vendorPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vendor"),
          orgConfigPda.toBuffer(),
          Buffer.from(newVendorName),
        ],
        PROGRAM_ID
      );

      const tx = await program.methods
        .registerVendor(newVendorName, vendorWalletPubkey)
        .accounts({
          vendorAccount: vendorPda,
          orgConfig: orgConfigPda,
          authority,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Tx: ", tx);

      setNewVendorName("");
      setNewVendorWallet("");
      setShowAddVendor("");
      setError("");

      await fetchVendors();
    } catch (err: any) {
      console.error("Error adding vendor:", err);
      setError(err.message || "Failed to add vendor");
    } finally {
      setAddingVendor(false);
    }
  };

  const handleActivateVendor = async (vendorName: string) => {
    setActionLoading(`activate-${vendorName}`);

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      const program = new Program(IDL, provider);
      const authority = wallet.publicKey!;

      const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        PROGRAM_ID
      );

      const [vendorPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vendor"),
          orgConfigPda.toBuffer(),
          Buffer.from(vendorName),
        ],
        PROGRAM_ID
      );

      await program.methods
        .activateVendor()
        .accounts({
          vendorAccount: vendorPda,
          orgConfig: orgConfigPda,
          authority,
        })
        .rpc();

      await fetchVendors();
    } catch (err: any) {
      console.error("Error activating vendor:", err);
      setError(err.message || "Failed to activate vendor");
    } finally {
      setActionLoading("");
    }
  };

  const handleDeactivateVendor = async (vendorName: string) => {
    setActionLoading(`deactivate-${vendorName}`);

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      const program = new Program(IDL, provider);
      const authority = wallet.publicKey!;

      const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        PROGRAM_ID
      );

      const [vendorPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vendor"),
          orgConfigPda.toBuffer(),
          Buffer.from(vendorName),
        ],
        PROGRAM_ID
      );

      await program.methods
        .deactivateVendor()
        .accounts({
          vendorAccount: vendorPda,
          orgConfig: orgConfigPda,
          authority,
        })
        .rpc();

      await fetchVendors();
    } catch (err: any) {
      console.error("Error deactivating vendor:", err);
      setError(err.message || "Failed to deactivate vendor");
    } finally {
      setActionLoading("");
    }
  };

  const handleUpdateVendorWallet = async (
    vendorName: string,
    newWallet: string
  ) => {
    const newWalletPubkey = new PublicKey(newWallet);
    setActionLoading(`update-${vendorName}`);

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      const program = new Program(IDL, provider);
      const authority = wallet.publicKey!;

      const [orgConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("org_config"), authority.toBuffer()],
        PROGRAM_ID
      );

      const [vendorPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vendor"),
          orgConfigPda.toBuffer(),
          Buffer.from(vendorName),
        ],
        PROGRAM_ID
      );

      await program.methods
        .updateVendorWallet(newWalletPubkey)
        .accounts({
          vendorAccount: vendorPda,
          orgConfig: orgConfigPda,
          authority,
        })
        .rpc();

      await fetchVendors();
    } catch (err: any) {
      console.error("Error updating vendor wallet:", err);
      setError(err.message || "Failed to update vendor wallet");
    } finally {
      setActionLoading("");
    }
  };

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <motion.div
        className="max-w-6xl mx-auto"
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Vendor Management</h1>
            <p className="text-slate-400">
              Manage vendors in your organization
            </p>
          </div>
          <motion.button
            onClick={() => setShowAddVendor("add")}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-green-700 flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-5 h-5" />
            Add Vendor
          </motion.button>
        </div>

        {/* Add Vendor Form */}
        {showAddVendor === "add" && (
          <motion.div
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3 className="text-xl font-bold mb-4">Register New Vendor</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Vendor Name
                </label>
                <input
                  type="text"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  disabled={addingVendor}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Vendor Wallet Address
                </label>
                <input
                  type="text"
                  value={newVendorWallet}
                  onChange={(e) => setNewVendorWallet(e.target.value)}
                  placeholder="Enter Solana wallet address"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                  disabled={addingVendor}
                />
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              <div className="flex gap-3">
                <motion.button
                  onClick={handleAddVendor}
                  disabled={addingVendor}
                  className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {addingVendor ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    "Register Vendor"
                  )}
                </motion.button>
                <motion.button
                  onClick={() => {
                    setShowAddVendor("");
                    setError("");
                  }}
                  disabled={addingVendor}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg font-semibold hover:bg-slate-600 disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Vendors List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : vendors.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <Users className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No vendors registered yet</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {vendors.map((vendor, idx) => (
              <motion.div
                key={idx}
                className="bg-slate-800/50 border border-slate-700 hover:border-emerald-500/50 transition-all rounded-lg p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold">{vendor.name}</h3>
                      {vendor.isActive ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <p className="text-slate-400 text-sm font-mono">
                      {vendor.wallet.slice(0, 8)}...{vendor.wallet.slice(-8)}
                    </p>
                  </div>
                  <div className="text-right mr-6">
                    <p className="text-slate-300 text-sm">Total Paid</p>
                    <p className="text-lg font-bold text-emerald-400">
                      {(vendor.totalPaid / 1_000_000).toFixed(2)} USDC
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {vendor.isActive ? (
                      <motion.button
                        onClick={() => handleDeactivateVendor(vendor.name)}
                        disabled={actionLoading === `deactivate-${vendor.name}`}
                        className="px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-medium flex items-center gap-2 text-sm disabled:opacity-50"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {actionLoading === `deactivate-${vendor.name}` ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                        Deactivate
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={() => handleActivateVendor(vendor.name)}
                        disabled={actionLoading === `activate-${vendor.name}`}
                        className="px-3 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg font-medium flex items-center gap-2 text-sm disabled:opacity-50"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {actionLoading === `activate-${vendor.name}` ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCw className="w-4 h-4" />
                        )}
                        Activate
                      </motion.button>
                    )}

                    <motion.button
                      onClick={() => setShowAddVendor(`update-${vendor.name}`)}
                      className="px-3 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg font-medium flex items-center gap-2 text-sm"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Edit2 className="w-4 h-4" />
                      Update
                    </motion.button>
                  </div>
                </div>

                {/* Update Wallet Form */}
                {showAddVendor === `update-${vendor.name}` && (
                  <motion.div
                    className="mt-4 pt-4 border-t border-slate-700 space-y-3"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <input
                      type="text"
                      placeholder="New wallet address"
                      defaultValue={vendor.wallet}
                      id={`update-${vendor.name}`}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    />
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => {
                          const input = document.getElementById(
                            `update-${vendor.name}`
                          ) as HTMLInputElement;
                          handleUpdateVendorWallet(vendor.name, input.value);
                        }}
                        disabled={actionLoading === `update-${vendor.name}`}
                        className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {actionLoading === `update-${vendor.name}` ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          "Confirm"
                        )}
                      </motion.button>
                      <motion.button
                        onClick={() => setShowAddVendor("")}
                        className="flex-1 px-3 py-2 bg-slate-700 text-slate-300 rounded-lg font-medium hover:bg-slate-600 text-sm"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Cancel
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
