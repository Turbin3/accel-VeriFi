/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  Zap,
  Loader,
  FileText,
  DollarSign,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { Buffer } from "buffer";

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);
const PINATA_GATEWAY =
  "https://emerald-abundant-baboon-978.mypinata.cloud/ipfs";

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

const statusMap: Record<number, string> = {
  0: "Validated",
  1: "InEscrowAwaitingVRF",
  2: "InEscrowAuditPending",
  3: "InEscrowReadyToSettle",
  4: "Paid",
  5: "Refunded",
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; icon: any }> = {
  Validated: { bg: "bg-blue-100", text: "text-blue-800", icon: CheckCircle2 },
  InEscrowAwaitingVRF: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    icon: Clock,
  },
  InEscrowAuditPending: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    icon: AlertCircle,
  },
  InEscrowReadyToSettle: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    icon: Zap,
  },
  Paid: { bg: "bg-green-100", text: "text-green-800", icon: CheckCircle2 },
  Refunded: { bg: "bg-red-100", text: "text-red-800", icon: AlertCircle },
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["Validated"];
  const Icon = config.icon;

  return (
    <div
      className={`${config.bg} ${config.text} px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 w-fit`}
    >
      <Icon size={14} />
      {status}
    </div>
  );
};

export function AdminDashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (wallet.publicKey) {
      fetchInvoices();
    }
  }, [wallet.publicKey]);

  const fetchInvoices = async () => {
    if (!wallet.publicKey) return;

    setLoading(true);
    setError(null);

    try {
      const invoiceDiscriminator = Buffer.from([
        105, 207, 226, 227, 85, 35, 132, 40,
      ]); // InvoiceAccount discriminator

      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
      const fetchedInvoices: Invoice[] = [];

      for (const { account } of allAccounts) {
        try {
          if (account.data.length < 100) continue;

          const discriminator = account.data.slice(0, 8);
          if (!discriminator.equals(invoiceDiscriminator)) continue;

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
          if (offset + 4 > account.data.length) continue;
          const vendorNameLen = account.data.readUInt32LE(offset);
          offset += 4;

          if (offset + vendorNameLen > account.data.length) continue;
          const vendor_name = account.data
            .slice(offset, offset + vendorNameLen)
            .toString();
          offset += vendorNameLen;

          // amount: u64 (8 bytes)
          if (offset + 8 > account.data.length) continue;
          const amount = account.data.readBigUInt64LE(offset);
          offset += 8;

          // due_date: i64 (8 bytes)
          if (offset + 8 > account.data.length) continue;
          const due_date = account.data.readBigInt64LE(offset);
          offset += 8;

          // ipfs_hash: String (4 bytes length + string data)
          if (offset + 4 > account.data.length) continue;
          const ipfsHashLen = account.data.readUInt32LE(offset);
          offset += 4;

          if (offset + ipfsHashLen > account.data.length) continue;
          const ipfs_hash = account.data
            .slice(offset, offset + ipfsHashLen)
            .toString();
          offset += ipfsHashLen;

          // status: Enum (1 byte)
          if (offset + 1 > account.data.length) continue;
          const statusByte = account.data[offset];
          offset += 1;

          const status = statusMap[statusByte] || "Unknown";

          // timestamp: i64 (8 bytes)
          if (offset + 8 > account.data.length) continue;
          const timestamp = account.data.readBigInt64LE(offset);

          const invoiceData: Invoice = {
            authority: authority_pubkey.toBase58(),
            vendor: vendor_pubkey.toBase58(),
            vendorName: vendor_name,
            amount: Number(amount) / 1_000_000, // Convert from lamports
            dueDate: Number(due_date),
            ipfsHash: ipfs_hash,
            status,
            timestamp: Number(timestamp),
          };

          fetchedInvoices.push(invoiceData);
        } catch (err) {
          console.error("Error processing invoice account:", err);
          continue;
        }
      }

      // Calculate status counts
      const counts: Record<string, number> = {};
      fetchedInvoices.forEach((invoice) => {
        counts[invoice.status] = (counts[invoice.status] || 0) + 1;
      });

      setInvoices(fetchedInvoices);
      setStatusCounts(counts);
    } catch (err: any) {
      console.error("Error fetching invoices:", err);
      setError("Failed to load invoices");
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

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const paidCount = statusCounts["Paid"] || 0;

  const chartData = [
    { name: "Week 1", invoices: invoices.length, paid: paidCount },
    { name: "Week 2", invoices: invoices.length, paid: paidCount },
    { name: "Week 3", invoices: invoices.length, paid: paidCount },
    { name: "Week 4", invoices: invoices.length, paid: paidCount },
  ];

  const statusData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status,
    value: count,
    color: STATUS_CONFIG[status]?.bg || "#666666",
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">
                Total Invoices
              </p>
              <p className="text-4xl font-bold text-white mt-2">
                {invoices.length}
              </p>
            </div>
            <FileText className="w-12 h-12 text-emerald-400/30" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Amount</p>
              <p className="text-4xl font-bold text-white mt-2">
                ${totalAmount.toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-blue-400/30" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">
                Paid Invoices
              </p>
              <p className="text-4xl font-bold text-white mt-2">{paidCount}</p>
            </div>
            <CheckCircle2 className="w-12 h-12 text-green-400/30" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Invoice Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #475569",
                }}
              />
              <Legend />
              <Bar dataKey="invoices" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="paid" fill="#22c55e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">All Invoices</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No invoices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {invoices.map((invoice, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-750 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-white">
                      <div>
                        <p>{invoice.vendorName}</p>
                        <p className="text-xs text-slate-400">
                          {invoice.vendor.slice(0, 8)}...
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      ${invoice.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {new Date(invoice.dueDate * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handleViewInvoice(invoice.ipfsHash)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
