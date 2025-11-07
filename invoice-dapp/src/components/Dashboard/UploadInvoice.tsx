/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Buffer } from "buffer";
import IDL from "../../invoice_claim.json";

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";

interface Organization {
  pubkey: string;
  name: string;
}

interface UploadInvoiceForm {
  amount: string;
  invoiceFile: File | null;
  organizationPubkey: string;
}

export function UploadInvoice() {
  const [formData, setFormData] = useState<UploadInvoiceForm>({
    amount: "",
    invoiceFile: null,
    organizationPubkey: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const { connection } = useConnection();
  const wallet = useWallet();

  // Fetch organizations where this wallet is a vendor
  useEffect(() => {
    if (wallet.publicKey) {
      fetchOrganizations();
    }
  }, [wallet.publicKey]);

  const fetchOrganizations = async () => {
    if (!wallet.publicKey) return;

    setLoadingOrgs(true);

    try {


      // Fetch all program accounts
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);

      // Filter for VendorAccount discriminator: [195, 199, 157, 136, 32, 253, 194, 7]
      const vendorDiscriminator = Buffer.from([
        195, 199, 157, 136, 32, 253, 194, 7,
      ]);

      const foundOrgs: Organization[] = [];

      for (const { account } of allAccounts) {
        try {
          if (account.data.length < 100) continue;

          const discriminator = account.data.slice(0, 8);
          if (!discriminator.equals(vendorDiscriminator)) continue;

          let offset = 8;

          // org: Pubkey (32 bytes)
          const orgPubkey = new PublicKey(
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

          // wallet: Pubkey (32 bytes)
          if (offset + 32 > account.data.length) continue;
          const wallet_pubkey = new PublicKey(
            account.data.slice(offset, offset + 32)
          );

          // Check if this vendor's wallet matches the current wallet
          if (wallet_pubkey.toBase58() === wallet.publicKey!.toBase58()) {
            // Check if we already have this org
            const alreadyExists = foundOrgs.some(
              (org) => org.pubkey === orgPubkey.toBase58()
            );

            if (!alreadyExists) {
              foundOrgs.push({
                pubkey: orgPubkey.toBase58(),
                name: `${vendor_name} - ${orgPubkey.toBase58().slice(0, 8)}...`,
              });
            }
          }
        } catch (err) {
          continue;
        }
      }

      console.log("✅ Found organizations:", foundOrgs);
      setOrganizations(foundOrgs);

      // Auto-select first org if available
      if (foundOrgs.length > 0) {
        setFormData((prev) => ({
          ...prev,
          organizationPubkey: foundOrgs[0].pubkey,
        }));
      }
    } catch (err: any) {
      console.error("❌ Error fetching organizations:", err);
      setError("Failed to load organizations");
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({
        ...prev,
        invoiceFile: file,
      }));
      setFileName(file.name);
      setError("");
    }
  };

  const uploadToPinata = async (file: File): Promise<string> => {
    console.log("📤 Uploading file to Pinata...", file.name);
    console.log(
      "🔑 PINATA_JWT status:",
      PINATA_JWT ? "✅ Loaded" : "❌ NOT LOADED"
    );

    const formDataForPinata = new FormData();
    formDataForPinata.append("file", file);

    try {
      console.log("📡 Sending request to Pinata API...");

      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
          },
          body: formDataForPinata,
        }
      );

      console.log("📊 Response status:", response.status);
      console.log("📊 Response headers:", {
        contentType: response.headers.get("content-type"),
      });

      const data = await response.json();
      console.log("📊 Pinata response:", data);

      if (!response.ok) {
        console.error("❌ Pinata error response:", data);
        throw new Error(
          `Pinata error (${response.status}): ${
            data.error?.reason || data.message || "Unknown error"
          }`
        );
      }

      const ipfsHash = data.IpfsHash;

      console.log("✅ File uploaded to Pinata:", ipfsHash);
      setUploadProgress(50);

      return ipfsHash;
    } catch (err: any) {
      console.error("❌ Pinata upload error:", err);
      console.error("❌ Error details:", {
        message: err.message,
        stack: err.stack,
      });
      throw new Error("Failed to upload file to IPFS: " + err.message);
    }
  };

  const createInvoiceRequestOnChain = async (
    ipfsHash: string,
    amount: number
  ): Promise<void> => {
    if (!wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    console.log("⛓️  Creating InvoiceRequest account on-chain...", {
      ipfsHash,
      amount,
    });

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
      });

      const program = new Program(IDL as any, provider);
      const authority = wallet.publicKey;

      // Derive InvoiceRequest PDA
      const nonce = new BN(Date.now());
      const nonceLe = Buffer.from(nonce.toArrayLike(Buffer, "le", 8));
      const [invoiceRequestPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("request"), authority.toBuffer(), nonceLe],
        PROGRAM_ID
      );

      console.log("📋 InvoiceRequest PDA:", invoiceRequestPda.toBase58());

      const tx = await program.methods
        .requestInvoiceExtraction(ipfsHash, new BN(amount), nonce)
        .accounts({
          authority: authority,
          invoiceRequest: invoiceRequestPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✅ InvoiceRequest created on-chain - TX:", tx);
      setUploadProgress(100);

      return;
    } catch (err: any) {
      console.error("❌ On-chain creation error:", err.message);
      console.error("❌ Full error:", err);
      throw new Error(
        "Failed to create invoice request on-chain: " + err.message
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.organizationPubkey) {
      setError("Please select an organization");
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (!formData.invoiceFile) {
      setError("Please select an invoice file");
      return;
    }

    if (!wallet.publicKey) {
      setError("Please connect your wallet");
      return;
    }

    if (!PINATA_JWT) {
      setError("Pinata JWT not configured. Please set VITE_PINATA_JWT");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    setUploadProgress(0);

    try {
      // Step 1: Upload to Pinata
      console.log("🚀 Starting invoice upload process...");
      const ipfsHash = await uploadToPinata(formData.invoiceFile);

      // Step 2: Convert amount to proper format
      // Parse as string first to avoid floating point issues
      const amountString = formData.amount;
      const amountInLowestUnit = Math.floor(
        parseFloat(amountString) * 1_000_000
      );
      console.log("💰 Amount as number:", amountInLowestUnit);
      console.log("💰 Amount type:", typeof amountInLowestUnit);

      // Step 3: Create InvoiceRequest on-chain
      // Pass amount as plain number - Anchor should handle u64 conversion
      await createInvoiceRequestOnChain(ipfsHash, amountInLowestUnit);

      setSuccess(
        `Invoice uploaded successfully! IPFS Hash: ${ipfsHash.slice(0, 12)}...`
      );
      console.log("✅ Complete invoice upload process finished");

      // Reset form
      setFormData({
        amount: "",
        invoiceFile: null,
        organizationPubkey:
          organizations.length > 0 ? organizations[0].pubkey : "",
      });
      setFileName("");
      setUploadProgress(0);
    } catch (err: any) {
      console.error("❌ Upload process error:", err);
      setError(err.message || "Failed to upload invoice");
      setUploadProgress(0);
    } finally {
      setUploading(false);
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
        className="max-w-2xl mx-auto"
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Upload Invoice</h1>
          <p className="text-slate-400">Submit a new invoice for processing</p>
        </div>

        {/* Form Card */}
        <motion.div
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Organization Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Organization
              </label>
              {loadingOrgs ? (
                <div className="flex items-center gap-2 px-4 py-2 text-slate-400">
                  <Loader className="w-4 h-4 animate-spin" />
                  Loading organizations...
                </div>
              ) : organizations.length === 0 ? (
                <div className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 text-sm">
                  No organizations found. You need to be registered as a vendor.
                </div>
              ) : (
                <select
                  name="organizationPubkey"
                  value={formData.organizationPubkey}
                  onChange={handleInputChange}
                  disabled={uploading}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="">Choose an organization...</option>
                  {organizations.map((org) => (
                    <option key={org.pubkey} value={org.pubkey}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Amount (USDC)
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                placeholder="Enter amount"
                step="0.01"
                min="0"
                disabled={uploading}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Invoice File
              </label>
              <div className="relative">
                <input
                  type="file"
                  onChange={handleFileChange}
                  disabled={uploading}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  id="invoice-file"
                />
                <label
                  htmlFor="invoice-file"
                  className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-slate-600 rounded-lg hover:border-purple-500 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span className="text-sm text-slate-300">
                      {fileName || "Click to select file or drag and drop"}
                    </span>
                    <span className="text-xs text-slate-500">
                      PDF, DOC, DOCX, JPG, PNG
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Progress Bar */}
            {uploading && uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300">Upload Progress</span>
                  <span className="text-purple-400">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-violet-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </motion.div>
            )}

            {/* Success Message */}
            {success && (
              <motion.div
                className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                <p className="text-green-400 text-sm">{success}</p>
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={uploading || organizations.length === 0}
              className="w-full px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg font-semibold hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {uploading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Invoice
                </>
              )}
            </motion.button>
          </form>
        </motion.div>

        {/* Info Section */}
        <motion.div
          className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            How it works
          </h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              ✅ 1. Select which organization you're uploading the invoice for
            </li>
            <li>
              ✅ 2. Upload your invoice document (PDF, images, or documents)
            </li>
            <li>✅ 3. File is uploaded to Pinata IPFS and gets a hash</li>
            <li>
              ✅ 4. InvoiceRequest account created on-chain with IPFS hash
            </li>
            <li>
              ✅ 5. Our Rust server polls and fetches the request, calls OCR AI
            </li>
            <li>✅ 6. Track invoice status through the Invoices tab</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
