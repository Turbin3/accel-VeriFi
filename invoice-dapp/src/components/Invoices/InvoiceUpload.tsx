// src/components/Invoices/InvoiceUpload.tsx
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "@/lib/hooks/useProgram";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function InvoiceUpload() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [ipfsHash, setIpfsHash] = useState("");
  const [amount, setAmount] = useState("");

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (files) => {
      const file = files[0];
      if (!file) return;

      // Upload to Pinata (use your API key)
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            body: formData,
            headers: {
              pinata_api_key: import.meta.env.VITE_PINATA_KEY,
              pinata_secret_api_key: import.meta.env.VITE_PINATA_SECRET,
            },
          }
        );

        const data = await res.json();
        setIpfsHash(data.IpfsHash);
        toast.success("Image uploaded to IPFS!");
      } catch (error) {
        toast.error("Upload failed");
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!program || !publicKey) throw new Error("Not connected");

      const amountBN = new window.anchor.BN(
        Math.floor(parseFloat(amount) * 1_000_000)
      );

      const [requestPda] = window.anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("request"), publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .requestInvoiceExtraction(ipfsHash, amountBN)
        .accounts({
          invoiceRequest: requestPda,
          authority: publicKey,
          systemProgram: window.anchor.web3.SystemProgram.programId,
        })
        .rpc();

      toast.success("Invoice submitted!");
      setIpfsHash("");
      setAmount("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Invoice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500"
        >
          <input {...getInputProps()} />
          <p>Drag invoice image here or click to select</p>
          {ipfsHash && <p className="text-green-600">✓ Uploaded: {ipfsHash}</p>}
        </div>

        <Input
          placeholder="Expected amount (USD)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <Button
          onClick={() => submitMutation.mutate()}
          disabled={!ipfsHash || !amount || submitMutation.isPending}
          className="w-full"
        >
          {submitMutation.isPending
            ? "Submitting..."
            : "Submit Invoice Request"}
        </Button>
      </CardContent>
    </Card>
  );
}
