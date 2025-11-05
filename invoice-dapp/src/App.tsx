import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AdminDashboard } from "@/components/Dashboard/AdminDashboard";
import UserHomepage from "@/components/Dashboard/UserHomepage";
import { SetupPage } from "@/components/Dashboard/SetupPage";
import { VendorManagement } from "@/components/Dashboard/VendorManagement";
import { InvoiceManagement } from "@/components/Dashboard/InvoiceManagement";
import { useSolanaWallet } from "./WalletProvider";
import { UploadInvoice } from "./components/Dashboard/UploadInvoice";

export default function App() {
  const [, setRole] = useState<"admin" | "user">("user");
  const [showSetup, setShowSetup] = useState(false);
  const [orgCreated, setOrgCreated] = useState(false);
  const [currentPage, setCurrentPage] = useState<
    "home" | "vendor" | "invoices" | "audit" | "dashboard" | "upload"
  >("home");

  const handleStartNow = () => {
    if (!orgCreated) {
      setShowSetup(true);
    } else {
      setRole("admin");
      setCurrentPage("dashboard");
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    setOrgCreated(true);
    setRole("admin");
    setCurrentPage("dashboard");
  };

  const WalletProvider = useSolanaWallet();

  return (
    <WalletProvider>
      <div className="min-h-screen w-full bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 overflow-x-hidden">
        {/* Navigation */}
        <nav className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 w-full">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              {/* Logo */}
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => {
                  setRole("user");
                  setShowSetup(false);
                  setCurrentPage("home");
                }}
              >
                <div className="w-10 h-10 bg-linear-to-br from-green-400 to-emerald-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">✅</span>
                </div>
                <h1 className="text-2xl font-bold text-white">VeriFi</h1>
              </div>

              {/* Navigation Links */}
              <div className="hidden md:flex items-center gap-8">
                <button
                  onClick={() => setCurrentPage("vendor")}
                  className="text-slate-300 hover:text-emerald-400 transition-colors font-medium"
                >
                  Vendor
                </button>
                <button
                  onClick={() => setCurrentPage("invoices")}
                  className="text-slate-300 hover:text-emerald-400 transition-colors font-medium"
                >
                  Invoices
                </button>
                <button
                  onClick={() => setCurrentPage("audit")}
                  className="text-slate-300 hover:text-emerald-400 transition-colors font-medium"
                >
                  Audit Queue
                </button>
                <button
                  onClick={() => setCurrentPage("dashboard")}
                  className="text-slate-300 hover:text-emerald-400 transition-colors font-medium"
                >
                  Dashboard
                </button>
              </div>

              {/* Right Section - Upload Invoice + Role Switcher + Wallet */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentPage("upload")}
                  className="px-4 py-2 rounded-lg font-medium transition-all bg-linear-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700"
                >
                  Upload Invoice
                </button>
                <button
                  onClick={() => {
                    setRole("user");
                    setShowSetup(false);
                    setCurrentPage("home");
                  }}
                  className="px-4 py-2 rounded-lg font-medium transition-all bg-slate-700 text-slate-300 hover:bg-slate-600"
                >
                  User
                </button>
                <button
                  onClick={() => setRole("admin")}
                  className="px-4 py-2 rounded-lg font-medium transition-all bg-slate-700 text-slate-300 hover:bg-slate-600"
                >
                  Admin
                </button>
                <WalletMultiButton className="bg-linear-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 rounded-lg px-6" />
              </div>
            </div>
          </div>
        </nav>

        {/* Content - Full Width */}
        <main className="w-full">
          {showSetup ? (
            <SetupPage onComplete={handleSetupComplete} />
          ) : currentPage === "upload" ? (
            <UploadInvoice />
          ) : currentPage === "vendor" ? (
            <VendorManagement />
          ) : currentPage === "invoices" ? (
            <InvoiceManagement />
          ) : currentPage === "dashboard" ? (
            <div className="px-6 py-8">
              <AdminDashboard />
            </div>
          ) : currentPage === "audit" ? (
            <div className="px-6 py-8 text-white">
              <h1 className="text-3xl font-bold">Audit Queue</h1>
              <p className="text-slate-400 mt-2">Coming soon...</p>
            </div>
          ) : (
            <UserHomepage onNavigateToDashboard={handleStartNow} />
          )}
        </main>
      </div>
    </WalletProvider>
  );
}
