import { useState } from "react";
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
  TrendingUp,
  Clock,
  CheckCircle2,
  Zap,
} from "lucide-react";

const mockInvoices = [
  {
    id: 1,
    vendor: "Jane Diaz",
    amount: 48.99,
    status: "inEscrowReadyToSettle",
    dueDate: "11/4/2025",
  },
  {
    id: 2,
    vendor: "Acme Corp",
    amount: 125.5,
    status: "inEscrowAuditPending",
    dueDate: "11/5/2025",
  },
  {
    id: 3,
    vendor: "Tech Solutions",
    amount: 299.99,
    status: "paid",
    dueDate: "11/1/2025",
  },
];

const statusData = [
  { name: "Pending", value: 0, color: "#f59e0b" },
  { name: "In Audit", value: 2, color: "#f97316" },
  { name: "Paid", value: 1, color: "#22c55e" },
];

const chartData = [
  { name: "Week 1", invoices: 5, paid: 2 },
  { name: "Week 2", invoices: 8, paid: 5 },
  { name: "Week 3", invoices: 6, paid: 4 },
  { name: "Week 4", invoices: 9, paid: 7 },
];

const StatusBadge = ({ status }: { status: string }) => {
  const statusMap: Record<string, { bg: string; text: string; icon: any }> = {
    pending: { bg: "bg-yellow-100", text: "text-yellow-800", icon: Clock },
    inEscrowAuditPending: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      icon: AlertCircle,
    },
    inEscrowReadyToSettle: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      icon: Zap,
    },
    paid: { bg: "bg-green-100", text: "text-green-800", icon: CheckCircle2 },
  };

  const config = statusMap[status] || statusMap["pending"];
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
  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: "Pending",
            value: "0",
            icon: Clock,
            color: "from-yellow-400 to-yellow-600",
          },
          {
            label: "In Audit",
            value: "2",
            icon: AlertCircle,
            color: "from-orange-400 to-orange-600",
          },
          {
            label: "Paid",
            value: "1",
            icon: CheckCircle2,
            color: "from-green-400 to-green-600",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">
                  {stat.label}
                </p>
                <p className="text-4xl font-bold text-white mt-2">
                  {stat.value}
                </p>
              </div>
              <div
                className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center`}
              >
                <stat.icon className="text-white" size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart */}
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

        {/* Pie Chart */}
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
              {mockInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="hover:bg-slate-750 transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-white">
                    {invoice.vendor}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    ${invoice.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {invoice.dueDate}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
