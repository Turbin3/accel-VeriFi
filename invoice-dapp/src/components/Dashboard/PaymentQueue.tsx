import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Loader,
    CheckCircle,
    XCircle,
    Eye,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import IDL from "../../invoice_claim.json";

const PROGRAM_ID = new PublicKey(
    import.meta.env.VITE_PROGRAM_ID || "DVxvMr8TyPWpnT4tQc56SCLXAiNr2VC4w22R6i7B1V9U"
);
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || "https://emerald-abundant-baboon-978.mypinata.cloud/ipfs";

interface PendingInvoice {
    invoiceAccount: string;   // invoice PDA
    vendor: string;
    vendorName: string;
    amount: number;
    dueDate: number;
}

export function PaymentQueue() {
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const { connection } = useConnection();
    const wallet = useWallet();

    useEffect(() => {
        if (wallet.publicKey) {
            fetchPaymentQueue();
        }
    }, [wallet.publicKey]);

    const fetchPaymentQueue = async () => {
        if (!wallet.publicKey) return;

        setLoading(true);
        setError("");

        try {
            const paymentQueueDiscriminator = Buffer.from([/* 8-byte discriminator here */]);
            /*
            You need to fill in the exact 8-byte discriminator for PaymentQueue account,
            use your Anchor IDL or Rust code to get it.
            */

            // Fetch all program accounts filtering by discriminator prefix
            const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
            const fetchedInvoices: PendingInvoice[] = [];

            for (const { pubkey, account } of allAccounts) {
                try {
                    if (account.data.length < 100) continue;

                    // Check discriminator
                    const discriminator = account.data.slice(0, 8);
                    if (!discriminator.equals(paymentQueueDiscriminator)) continue;

                    // Parse PaymentQueue account data from account.data
                    // Skip discriminator 8 bytes
                    let offset = 8;

                    // org: Pubkey (32 bytes)
                    offset += 32;

                    // pending_invoices: Vec<PendingPayment>
                    // It is a Rust Anchor Vec serialized as:
                    // - 4-byte length (u32 little endian)
                    // - repeated entries of PendingPayment

                    const len = account.data.readUInt32LE(offset);
                    offset += 4;

                    for (let i = 0; i < len; i++) {
                        // PendingPayment fields:
                        // invoice_account: Pubkey (32 bytes)
                        const invoiceAccount = new PublicKey(account.data.slice(offset, offset + 32));
                        offset += 32;

                        // vendor: Pubkey (32 bytes)
                        const vendor = new PublicKey(account.data.slice(offset, offset + 32));
                        offset += 32;

                        // due_date: i64 (8 bytes)
                        const dueDate = Number(account.data.readBigInt64LE(offset));
                        offset += 8;

                        // amount: u64 (8 bytes)
                        const amount = Number(account.data.readBigUInt64LE(offset));
                        offset += 8;

                        // For vendor_name, you may want to fetch vendor account separately or cache vendor info.
                        // For simplicity, show vendor public key as vendorName
                        fetchedInvoices.push({
                            invoiceAccount: invoiceAccount.toBase58(),
                            vendor: vendor.toBase58(),
                            vendorName: vendor.toBase58(),
                            amount: amount / 1_000_000, // assuming 6 decimals e.g. USDC
                            dueDate,
                        });
                    }
                } catch (err) {
                    console.error("Error processing payment queue account:", err);
                }
            }

            setInvoices(fetchedInvoices);
        } catch (err: any) {
            console.error("Error fetching payment queue:", err);
            setError("Failed to load payment queue");
        } finally {
            setLoading(false);
        }
    };

    const handleViewInvoice = (invoiceAccount: string) => {
        // In your flow, you might want to fetch invoice account's IPFS hash separately
        alert(`Implement viewing invoice details for: ${invoiceAccount}`);
    };

    const fadeIn = {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6 },
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
            <motion.div className="max-w-7xl mx-auto" variants={fadeIn} initial="initial" animate="animate">
                <div className="mb-8 flex justify-between items-center">
                    <h1 className="text-4xl font-bold mb-2">Payment Queue</h1>
                    <button
                        onClick={fetchPaymentQueue}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center mb-8">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader className="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg">No invoices currently in the payment queue</p>
                        <p className="text-slate-500 text-sm mt-2">All payments caught up! 🎉</p>
                    </div>
                ) : (
                    <motion.div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                <tr className="border-b border-slate-700 bg-slate-900/50">
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Vendor</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Amount</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Due Date</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Invoice Account</th>
                                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-300">Actions</th>
                                </tr>
                                </thead>
                                <tbody>
                                {invoices.map((invoice, idx) => {
                                    const dueDate = new Date(invoice.dueDate * 1000).toLocaleDateString();

                                    return (
                                        <motion.tr key={invoice.invoiceAccount} className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}>
                                            <td className="px-6 py-4">
                                                <div className="text-sm">
                                                    <p className="font-medium">{invoice.vendorName}</p>
                                                    <p className="text-xs text-slate-400 truncate max-w-xs">{invoice.vendor.slice(0, 8)}...</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="font-semibold text-emerald-400">${invoice.amount.toFixed(2)}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-slate-300">{dueDate}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-mono text-slate-400 truncate max-w-xs">{invoice.invoiceAccount.slice(0, 16)}...</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => handleViewInvoice(invoice.invoiceAccount)}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                                                >
                                                    <Eye size={14} /> View
                                                </button>
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
