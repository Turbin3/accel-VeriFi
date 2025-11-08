/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import IDL from "../../invoice_claim.json";

const PINATA_GATEWAY = "https://emerald-abundant-baboon-978.mypinata.cloud/ipfs";

interface Invoice {
  pubkey: PublicKey;
  authority: string;
  vendor: string;
  vendorName: string;
  amount: number;
  dueDate: number;
  ipfsHash: string;
  status: string;
  timestamp: number;
  nonce: number;
}

const STATUS_CONFIG: Record<
    string,
    { label: string; color: string; icon: React.ReactNode }
> = {
  validated: {
    label: "Validated",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  inEscrowAwaitingVrf: {
    label: "Awaiting VRF",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: <Clock className="w-4 h-4" />,
  },
  inEscrowAuditPending: {
    label: "Audit Pending",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  inEscrowReadyToSettle: {
    label: "Ready to Settle",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  paid: {
    label: "Paid",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  refunded: {
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
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      const program = new Program(IDL as any, provider);

      console.log("📋 Fetching all invoices...");

      // Use Anchor's deserialization
      // @ts-ignore
      const allInvoices = await program.account.invoiceAccount.all();
      console.log(`✅ Found ${allInvoices.length} total invoices`);

      const fetchedInvoices: Invoice[] = allInvoices.map((invoice: { account: any; publicKey: any; }) => {
        const account = invoice.account as any;

        // Debug log
        console.log("Raw account:", account);
        console.log("vendor_name:", account.vendorName);
        console.log("ipfs_hash:", account.ipfsHash);
        console.log("status:", account.status);

        // Get status key (camelCase)
        const statusKey = Object.keys(account.status || {})[0] || "unknown";

        return {
          pubkey: invoice.publicKey,
          authority: account.authority.toBase58(),
          vendor: account.vendor.toBase58(),
          vendorName: account.vendorName || "Unknown Vendor",  // Changed from vendor_name
          amount: account.amount?.toNumber?.() / 1_000_000 || 0,
          dueDate: account.dueDate?.toNumber?.() || 0,  // Changed from due_date
          ipfsHash: account.ipfsHash || "",  // Changed from ipfs_hash
          status: statusKey,
          timestamp: account.timestamp?.toNumber?.() || 0,
          nonce: account.nonce?.toNumber?.() || 0,
        };
      });

      console.log("✅ All invoices fetched:", fetchedInvoices);

      // Calculate status counts
      const counts: Record<string, number> = {};
      fetchedInvoices.forEach((invoice) => {
        counts[invoice.status] = (counts[invoice.status] || 0) + 1;
      });

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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
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
                    {statusCounts["paid"] || 0}
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
                      const config = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.validated;
                      const dueDate = invoice.dueDate > 0
                          ? new Date(invoice.dueDate * 1000).toLocaleDateString()
                          : "N/A";

                      return (
                          <motion.tr
                              key={invoice.pubkey.toBase58()}
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
                              {invoice.ipfsHash ? (
                                  <a
                                      href={`${PINATA_GATEWAY}/${invoice.ipfsHash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline truncate max-w-xs block"
                                      title={invoice.ipfsHash}
                                  >
                                    {invoice.ipfsHash.slice(0, 12)}...
                                  </a>
                              ) : (
                                  <span className="text-xs text-slate-500">N/A</span>
                              )}
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
