import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Loader,
    CheckCircle,
    Eye,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";

const PROGRAM_ID = new PublicKey(
    import.meta.env.VITE_PROGRAM_ID || "7DCAzfvmrbjDuoQMSdamKwguDTQ48QAuedDHpWPynJvx"
);

const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || "https://emerald-abundant-baboon-978.mypinata.cloud/ipfs";

interface PendingInvoice {
    invoiceAccount: string;
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
            // PaymentQueue discriminator from IDL
            const paymentQueueDiscriminator = Buffer.from([252, 158, 5, 213, 84, 121, 59, 80]);

            // Fetch all program accounts with base58 filter
            const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: bs58.encode(paymentQueueDiscriminator),
                        },
                    },
                ],
            });

            console.log(`Found ${allAccounts.length} PaymentQueue account(s)`);

            const fetchedInvoices: PendingInvoice[] = [];

            for (const { pubkey, account } of allAccounts) {
                try {
                    console.log(`Processing PaymentQueue: ${pubkey.toBase58()}`);

                    let offset = 8; // Skip discriminator

                    // org: Pubkey (32 bytes)
                    const org = new PublicKey(account.data.slice(offset, offset + 32));
                    offset += 32;
                    console.log(`  Org: ${org.toBase58()}`);

                    // pending_invoices: Vec<PendingPayment>
                    const len = account.data.readUInt32LE(offset);
                    offset += 4;
                    console.log(`  Pending invoices count: ${len}`);

                    for (let i = 0; i < len; i++) {
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

                        console.log(`  Invoice ${i}: ${invoiceAccount.toBase58()}, Amount: ${amount}, Due: ${dueDate}`);

                        fetchedInvoices.push({
                            invoiceAccount: invoiceAccount.toBase58(),
                            vendor: vendor.toBase58(),
                            vendorName: vendor.toBase58().slice(0, 8) + "...",
                            amount: amount / 1_000_000, // Assuming 6 decimals (USDC)
                            dueDate,
                        });
                    }
                } catch (err) {
                    console.error("Error processing payment queue account:", err);
                }
            }

            console.log(`Total invoices fetched: ${fetchedInvoices.length}`);
            setInvoices(fetchedInvoices);
        } catch (err: any) {
            console.error("Error fetching payment queue:", err);
            setError("Failed to load payment queue");
        } finally {
            setLoading(false);
        }
    };

    const handleViewInvoice = async (invoiceAccountAddress: string) => {
        try {
            const invoicePubkey = new PublicKey(invoiceAccountAddress);

            // Fetch the invoice account to get IPFS hash
            const accountInfo = await connection.getAccountInfo(invoicePubkey);

            if (!accountInfo) {
                alert("Invoice account not found");
                return;
            }

            const invoiceDiscriminator = Buffer.from([105, 207, 226, 227, 85, 35, 132, 40]);
            const discriminator = accountInfo.data.slice(0, 8);

            if (!discriminator.equals(invoiceDiscriminator)) {
                alert("Invalid invoice account");
                return;
            }

            let offset = 8;

            // authority: Pubkey (32 bytes)
            offset += 32;

            // vendor: Pubkey (32 bytes)
            offset += 32;

            // vendor_name: String (4 bytes length + string data)
            const vendorNameLen = accountInfo.data.readUInt32LE(offset);
            offset += 4 + vendorNameLen;

            // amount: u64 (8 bytes)
            offset += 8;

            // due_date: i64 (8 bytes)
            offset += 8;

            // ipfs_hash: String (4 bytes length + string data)
            const ipfsHashLen = accountInfo.data.readUInt32LE(offset);
            offset += 4;

            const ipfsHash = accountInfo.data.slice(offset, offset + ipfsHashLen).toString();

            // Open the invoice in a new tab
            const fileUrl = `${PINATA_GATEWAY}/${ipfsHash}`;
            window.open(fileUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
            console.error("Error opening invoice:", error);
            alert("Failed to open invoice");
        }
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
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => handleViewInvoice(invoice.invoiceAccount)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
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
