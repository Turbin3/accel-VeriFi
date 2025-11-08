/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Loader,
    AlertCircle,
    CheckCircle,
    XCircle,
    Eye,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";

const PROGRAM_ID = new PublicKey(
    import.meta.env.VITE_PROGRAM_ID || "DVxvMr8TyPWpnT4tQc56SCLXAiNr2VC4w22R6i7B1V9U"
);
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || "https://emerald-abundant-baboon-978.mypinata.cloud/ipfs";

interface Invoice {
    pubkey: string;
    authority: string;
    vendor: string;
    vendorName: string;
    amount: number;
    dueDate: number;
    ipfsHash: string;
    status: string;
    timestamp: number;
}

export function AuditQueue() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState<string | null>(null);

    const { connection } = useConnection();
    const wallet = useWallet();

    useEffect(() => {
        if (wallet.publicKey) {
            fetchPendingInvoices();
        }
    }, [wallet.publicKey]);

    const fetchPendingInvoices = async () => {
        if (!wallet.publicKey) return;

        setLoading(true);
        setError("");

        try {
            const invoiceDiscriminator = Buffer.from([105, 207, 226, 227, 85, 35, 132, 40]);
            const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
            const fetchedInvoices: Invoice[] = [];

            for (const { pubkey, account } of allAccounts) {
                try {
                    if (account.data.length < 100) continue;

                    const discriminator = account.data.slice(0, 8);
                    if (!discriminator.equals(invoiceDiscriminator)) continue;

                    let offset = 8;

                    // Parse invoice account
                    const authority_pubkey = new PublicKey(account.data.slice(offset, offset + 32));
                    offset += 32;

                    const vendor_pubkey = new PublicKey(account.data.slice(offset, offset + 32));
                    offset += 32;

                    const vendorNameLen = account.data.readUInt32LE(offset);
                    offset += 4;
                    const vendor_name = account.data.slice(offset, offset + vendorNameLen).toString();
                    offset += vendorNameLen;

                    const amount = account.data.readBigUInt64LE(offset);
                    offset += 8;

                    const due_date = account.data.readBigInt64LE(offset);
                    offset += 8;

                    const ipfsHashLen = account.data.readUInt32LE(offset);
                    offset += 4;
                    const ipfs_hash = account.data.slice(offset, offset + ipfsHashLen).toString();
                    offset += ipfsHashLen;

                    const statusByte = account.data[offset];
                    offset += 1;

                    const statusMap: Record<number, string> = {
                        0: "Validated",
                        1: "InEscrowAwaitingVRF",
                        2: "InEscrowAuditPending",
                        3: "InEscrowReadyToSettle",
                        4: "Paid",
                        5: "Refunded",
                    };
                    const status = statusMap[statusByte] || "Unknown";

                    const timestamp = account.data.readBigInt64LE(offset);

                    // Only include invoices with InEscrowAuditPending status
                    if (status === "InEscrowAuditPending") {
                        fetchedInvoices.push({
                            pubkey: pubkey.toBase58(),
                            authority: authority_pubkey.toBase58(),
                            vendor: vendor_pubkey.toBase58(),
                            vendorName: vendor_name,
                            amount: Number(amount) / 1_000_000,
                            dueDate: Number(due_date),
                            ipfsHash: ipfs_hash,
                            status,
                            timestamp: Number(timestamp),
                        });
                    }
                } catch (err) {
                    console.error("Error processing invoice account:", err);
                }
            }

            console.log(`Found ${fetchedInvoices.length} invoices pending audit`);
            setInvoices(fetchedInvoices);
        } catch (err: any) {
            console.error("Error fetching invoices:", err);
            setError("Failed to load audit queue");
        } finally {
            setLoading(false);
        }
    };

    const handleViewInvoice = (ipfsHash: string) => {
        try {
            const fileUrl = `${PINATA_GATEWAY}/${ipfsHash}`;
            window.open(fileUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
            console.error("Error opening invoice:", error);
            alert("Failed to open invoice");
        }
    };

    const handleAuditDecision = async (invoice: Invoice, approve: boolean) => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            alert("Wallet not connected");
            return;
        }

        setProcessing(invoice.pubkey);

        try {
            // Derive org config PDA
            const [orgConfigPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("org_config"), wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // Derive invoice PDA
            const [invoicePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("invoice"), new PublicKey(invoice.authority).toBuffer()],
                PROGRAM_ID
            );

            console.log("Org Config PDA:", orgConfigPda.toBase58());
            console.log("Invoice PDA:", invoicePda.toBase58());

            // Create audit_decide instruction
            // Instruction discriminator for audit_decide
            const discriminator = Buffer.from([
                // You may need to calculate this from your IDL
                // For now using a placeholder - replace with actual discriminator
                0, 0, 0, 0, 0, 0, 0, 0,
            ]);

            // Instruction data: discriminator + approve (1 byte boolean)
            const data = Buffer.concat([
                discriminator,
                Buffer.from([approve ? 1 : 0]),
            ]);

            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                    { pubkey: orgConfigPda, isSigner: false, isWritable: true },
                    { pubkey: invoicePda, isSigner: false, isWritable: true },
                ],
                programId: PROGRAM_ID,
                data,
            });

            const transaction = new Transaction().add(instruction);
            transaction.feePayer = wallet.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

            const signed = await wallet.signTransaction(transaction);
            const signature = await connection.sendRawTransaction(signed.serialize());

            console.log("Transaction sent:", signature);

            await connection.confirmTransaction(signature, "confirmed");

            alert(`Invoice ${approve ? "approved" : "rejected"} successfully!`);

            // Refresh the list
            await fetchPendingInvoices();
        } catch (err: any) {
            console.error("Error processing audit decision:", err);
            alert(`Failed to ${approve ? "approve" : "reject"} invoice: ${err.message}`);
        } finally {
            setProcessing(null);
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
                className="max-w-7xl mx-auto"
                variants={fadeIn}
                initial="initial"
                animate="animate"
            >
                {/* Header */}
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">Audit Queue</h1>
                        <p className="text-slate-400">
                            Review and approve pending invoices
                        </p>
                    </div>
                    <button
                        onClick={fetchPendingInvoices}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>

                {/* Stats Card */}
                <motion.div
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8"
                    whileHover={{ borderColor: "rgb(251, 146, 60)" }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-400 text-sm">Pending Audits</p>
                            <p className="text-3xl font-bold text-orange-400">
                                {invoices.length}
                            </p>
                        </div>
                        <AlertCircle className="w-12 h-12 text-orange-400/30" />
                    </div>
                </motion.div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center mb-8">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {/* Loading State */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader className="w-8 h-8 text-emerald-400 animate-spin" />
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg">
                            No invoices pending audit
                        </p>
                        <p className="text-slate-500 text-sm mt-2">
                            All caught up! 🎉
                        </p>
                    </div>
                ) : (
                    /* Invoices Table */
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
                                        Due Date
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                                        IPFS Hash
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-300">
                                        Actions
                                    </th>
                                </tr>
                                </thead>
                                <tbody>
                                {invoices.map((invoice, idx) => {
                                    const dueDate = new Date(
                                        invoice.dueDate * 1000
                                    ).toLocaleDateString();
                                    const isProcessing = processing === invoice.pubkey;

                                    return (
                                        <motion.tr
                                            key={invoice.pubkey}
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
                                                    ${invoice.amount.toFixed(2)}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-slate-300">{dueDate}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-mono text-slate-400 truncate max-w-xs">
                                                    {invoice.ipfsHash.slice(0, 16)}...
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    {/* View Button */}
                                                    <button
                                                        onClick={() => handleViewInvoice(invoice.ipfsHash)}
                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1"
                                                        disabled={isProcessing}
                                                    >
                                                        <Eye size={14} />
                                                        View
                                                    </button>

                                                    {/* Approve Button */}
                                                    <button
                                                        onClick={() => handleAuditDecision(invoice, true)}
                                                        disabled={isProcessing}
                                                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <CheckCircle size={14} />
                                                        {isProcessing ? "..." : "Approve"}
                                                    </button>

                                                    {/* Reject Button */}
                                                    <button
                                                        onClick={() => handleAuditDecision(invoice, false)}
                                                        disabled={isProcessing}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <XCircle size={14} />
                                                        {isProcessing ? "..." : "Reject"}
                                                    </button>
                                                </div>
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
