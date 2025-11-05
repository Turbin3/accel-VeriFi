/* eslint-disable @typescript-eslint/no-explicit-any */
// InvoiceManagement.tsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Loader,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);

interface Invoice {
  authority: string;
  vendor: string;
  vendorName: string;
  amount: number;
  dueDate: number;
  ipfsHash: string;
  status: string;
  timestamp: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  Validated: {
    label: "Validated",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  InEscrowAwaitingVRF: {
    label: "Awaiting VRF",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: <Clock className="w-4 h-4" />,
  },
  InEscrowAuditPending: {
    label: "Audit Pending",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  InEscrowReadyToSettle: {
    label: "Ready to Settle",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  Paid: {
    label: "Paid",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  Refunded: {
    label: "Refunded",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: <AlertCircle className="w-4 h-4" />,
  },
};

export function InvoiceManagement() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const { connection } = useConnection();
  const wallet = useWallet();

  useEffect(() => {
    if (wallet.publicKey) {
      fetchInvoices();
    }
  }, [wallet.publicKey]);

  const fetchInvoices = async () => {
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

      console.log("📋 Fetching invoices for org:", orgConfigPda.toBase58());

      // Fetch all program accounts
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
      console.log(`📊 Total accounts in program: ${allAccounts.length}`);

      // Filter and decode invoice accounts
      const fetchedInvoices: Invoice[] = [];
      const invoiceDiscriminator = Buffer.from([
        105, 207, 226, 227, 85, 35, 132, 40,
      ]); // InvoiceAccount discriminator

      console.log(
        `🔍 Looking for invoice discriminator: ${invoiceDiscriminator.toString(
          "hex"
        )}`
      );

      for (const { account } of allAccounts) {
        try {
          if (account.data.length < 100) continue;

          const discriminator = account.data.slice(0, 8);
          if (!discriminator.equals(invoiceDiscriminator)) continue;

          console.log("✅ Found invoice account!");

          let offset = 8;

          // authority: Pubkey (32 bytes)
          const authority_pubkey = new PublicKey(
            account.data.slice(offset, offset + 32)
          );
          offset += 32;

          // vendor: Pubkey (32 bytes)
          const vendor_pubkey = new PublicKey(
            account.data.slice(offset, offset + 32)
          );
          offset += 32;

          // vendor_name: String (4 bytes length + string data)
          if (offset + 4 > account.data.length) {
            console.warn("⚠️ Not enough data for vendor_name length");
            continue;
          }
          const vendorNameLen = account.data.readUInt32LE(offset);
          console.log(`  📝 Vendor name length: ${vendorNameLen}`);
          offset += 4;

          if (offset + vendorNameLen > account.data.length) {
            console.warn("⚠️ Not enough data for vendor_name");
            continue;
          }
          const vendor_name = account.data
            .slice(offset, offset + vendorNameLen)
            .toString();
          console.log(`  📝 Vendor name: ${vendor_name}`);
          offset += vendorNameLen;

          // amount: u64 (8 bytes)
          if (offset + 8 > account.data.length) {
            console.warn("⚠️ Not enough data for amount");
            continue;
          }
          const amount = account.data.readBigUInt64LE(offset);
          offset += 8;

          // DEBUG: Log raw amount
          console.log("💰 Raw amount from blockchain:", {
            amountBigInt: amount.toString(),
            amountNumber: Number(amount),
            amountHex: "0x" + amount.toString(16),
            bytes: account.data.slice(offset - 8, offset).toString("hex"),
          });

          // due_date: i64 (8 bytes)
          if (offset + 8 > account.data.length) {
            console.warn("⚠️ Not enough data for due_date");
            continue;
          }
          const due_date = account.data.readBigInt64LE(offset);
          offset += 8;

          // ipfs_hash: String (4 bytes length + string data)
          if (offset + 4 > account.data.length) {
            console.warn("⚠️ Not enough data for ipfs_hash length");
            continue;
          }
          const ipfsHashLen = account.data.readUInt32LE(offset);
          console.log(`  🌐 IPFS hash length: ${ipfsHashLen}`);
          offset += 4;

          if (offset + ipfsHashLen > account.data.length) {
            console.warn("⚠️ Not enough data for ipfs_hash");
            continue;
          }
          const ipfs_hash = account.data
            .slice(offset, offset + ipfsHashLen)
            .toString();
          console.log(`  🌐 IPFS hash: ${ipfs_hash}`);
          offset += ipfsHashLen;

          // status: Enum (1 byte for variant)
          if (offset + 1 > account.data.length) {
            console.warn("⚠️ Not enough data for status");
            continue;
          }
          const statusByte = account.data[offset];
          offset += 1;

          // Map status byte to status name
          const statusMap: Record<number, string> = {
            0: "Validated",
            1: "InEscrowAwaitingVRF",
            2: "InEscrowAuditPending",
            3: "InEscrowReadyToSettle",
            4: "Paid",
            5: "Refunded",
          };
          const status = statusMap[statusByte] || "Unknown";
          console.log(`  📊 Status: ${status} (byte: ${statusByte})`);

          // timestamp: i64 (8 bytes)
          if (offset + 8 > account.data.length) {
            console.warn("⚠️ Not enough data for timestamp");
            continue;
          }
          const timestamp = account.data.readBigInt64LE(offset);

          const invoiceData = {
            authority: authority_pubkey.toBase58(),
            vendor: vendor_pubkey.toBase58(),
            vendorName: vendor_name,
            amount: Number(amount),
            dueDate: Number(due_date),
            ipfsHash: ipfs_hash,
            status,
            timestamp: Number(timestamp),
          };

          // DEBUG: Log the invoice being added
          console.log("📌 Invoice being added:", invoiceData);

          fetchedInvoices.push(invoiceData);
        } catch (err) {
          console.error("❌ Error processing invoice account:", err);
          continue;
        }
      }

      // Calculate status counts
      const counts: Record<string, number> = {};
      fetchedInvoices.forEach((invoice) => {
        counts[invoice.status] = (counts[invoice.status] || 0) + 1;
      });

      // DEBUG: Log all fetched invoices
      console.log("✅ All invoices fetched:", fetchedInvoices);
      console.log("📊 Status counts:", counts);
      console.log(`🎯 Total invoices count: ${fetchedInvoices.length}`);

      setInvoices(fetchedInvoices);
      setStatusCounts(counts);
    } catch (err: any) {
      console.error("❌ Error fetching invoices:", err);
      setError("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  const totalInvoices = invoices.length;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <motion.div
        className="max-w-7xl mx-auto"
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Invoice Management</h1>
          <p className="text-slate-400">
            Track all invoices and their processing status
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-6"
            whileHover={{ borderColor: "rgb(34, 197, 94)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Invoices</p>
                <p className="text-3xl font-bold text-emerald-400">
                  {totalInvoices}
                </p>
              </div>
              <FileText className="w-12 h-12 text-emerald-400/30" />
            </div>
          </motion.div>

          <motion.div
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-6"
            whileHover={{ borderColor: "rgb(34, 197, 94)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Amount</p>
                <p className="text-3xl font-bold text-blue-400">
                  {invoices
                    .reduce((sum, inv) => sum + inv.amount, 0)
                    .toFixed(2)}{" "}
                  USDC
                </p>
              </div>
              <DollarSign className="w-12 h-12 text-blue-400/30" />
            </div>
          </motion.div>

          <motion.div
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-6"
            whileHover={{ borderColor: "rgb(34, 197, 94)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Paid Invoices</p>
                <p className="text-3xl font-bold text-green-400">
                  {statusCounts["Paid"] || 0}
                </p>
              </div>
              <CheckCircle className="w-12 h-12 text-green-400/30" />
            </div>
          </motion.div>
        </div>

        {/* Status Breakdown */}
        <motion.div
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h2 className="text-xl font-bold mb-4">Status Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <div
                key={status}
                className={`border rounded-lg p-3 text-center ${config.color}`}
              >
                <p className="text-xs font-medium mb-1">{config.label}</p>
                <p className="text-xl font-bold">{statusCounts[status] || 0}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Invoices List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No invoices found</p>
          </div>
        ) : (
          <motion.div
            className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/50">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                      Vendor
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                      Due Date
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                      IPFS Hash
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, idx) => {
                    const config = STATUS_CONFIG[invoice.status];
                    const dueDate = new Date(
                      invoice.dueDate * 1000
                    ).toLocaleDateString();

                    return (
                      <motion.tr
                        key={idx}
                        className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="font-medium">{invoice.vendorName}</p>
                            <p className="text-xs text-slate-400">
                              {invoice.vendor.slice(0, 8)}...
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-emerald-400">
                            {invoice.amount.toFixed(2)} USDC
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div
                            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${config.color} text-xs font-medium`}
                          >
                            {config.icon}
                            {config.label}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-300">{dueDate}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-mono text-slate-400 truncate max-w-xs">
                            {invoice.ipfsHash.slice(0, 12)}...
                          </p>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
