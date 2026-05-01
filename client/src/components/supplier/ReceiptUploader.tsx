/**
 * Receipt / PO-Confirmation Uploader
 *
 * Drops a PDF or photo of a supplier receipt into Claude vision
 * (server/_core/claudeFiles.ts → server/routers/supplier.ts
 * parseReceiptDocument). Returns strict-JSON line items the user
 * can review and one-click promote into a draft PO.
 *
 * UX shape:
 *   1. Drop zone — drag-and-drop OR file-picker. Max 8MB.
 *   2. Preview — file name + size, with a "Re-upload" affordance.
 *   3. Parse — server-side vision extract; shows a one-line status.
 *   4. Review — line-item table with editable cells before commit.
 *   5. Create PO — calls supplier.createDraft with the parsed payload.
 *
 * The server-side endpoint deletes the uploaded file after extraction
 * (receipts are sensitive); this component only holds bytes in memory.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Upload, X, Sparkles, Loader2, Check, AlertCircle, Pencil } from "lucide-react";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — matches server cap.
const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
type AcceptedMime = (typeof ACCEPTED_MIME)[number];

type ParsedLineItem = {
  description: string;
  sku: string | null;
  quantity: number;
  unitCostCents: number;
};

type ParsedDocument = {
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  shippingCents: number | null;
  totalCents: number | null;
  lineItems: ParsedLineItem[];
};

interface ReceiptUploaderProps {
  storeId: number;
  /** Fires after a successful supplier.createDraft — parent typically refetches pos.list. */
  onPOCreated: (poId: number, poNumber: string) => void;
  /** Optional close handler when this lives inside a Dialog. */
  onClose?: () => void;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Node-style btoa over a chunked binary string (avoids the 1MB
  // call-stack limit on String.fromCharCode for long arrays).
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export function ReceiptUploader({ storeId, onPOCreated, onClose }: ReceiptUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [editedItems, setEditedItems] = useState<ParsedLineItem[]>([]);
  const [supplierIdOverride, setSupplierIdOverride] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseMutation = trpc.supplier.parseReceiptDocument.useMutation({
    onSuccess: (data) => {
      const doc = (data?.parsed as ParsedDocument | null) ?? null;
      if (!doc || !Array.isArray(doc.lineItems)) {
        toast.error("Couldn't extract structured data. Re-upload a clearer scan.");
        return;
      }
      setParsed(doc);
      setEditedItems(doc.lineItems);
      if (doc.lineItems.length === 0) {
        toast.warning("Document parsed, but no line items found. Try a sharper scan or enter manually.");
      } else {
        toast.success(`Extracted ${doc.lineItems.length} line item${doc.lineItems.length === 1 ? "" : "s"}`);
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const createMutation = trpc.supplier.createDraft.useMutation({
    onSuccess: ({ poId, poNumber }) => {
      toast.success(`Draft ${poNumber} created from receipt`);
      if (poId) onPOCreated(poId, poNumber);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── File handling ───────────────────────────────────────────────
  const acceptFile = useCallback((f: File) => {
    if (!ACCEPTED_MIME.includes(f.type as AcceptedMime)) {
      toast.error("Unsupported file type. Use PDF, PNG, JPEG, or WebP.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Max 8MB.`);
      return;
    }
    setFile(f);
    setParsed(null);
    setEditedItems([]);
  }, []);

  const handleParse = async () => {
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    parseMutation.mutate({
      filename: file.name,
      bytesBase64: bytesToBase64(buf),
      mimeType: file.type as AcceptedMime,
    });
  };

  const handleCreate = () => {
    const valid = editedItems.filter(
      (li) => li.quantity > 0 && li.unitCostCents > 0 && li.description.trim().length > 0,
    );
    if (valid.length === 0) {
      toast.error("At least one line item is required.");
      return;
    }
    // Stash the receipt's parsed descriptions + supplier metadata in
    // the PO's notes field so they're preserved alongside the
    // line-item rows (which are productId-keyed and can't carry the
    // raw description). The Merchant Bot can later match each
    // description → an internal product and update productId.
    const noteLines = [
      parsed?.documentNumber ? `Imported from ${parsed.documentNumber}` : "Imported from receipt",
      parsed?.documentDate ? `Document date: ${parsed.documentDate}` : "",
      "",
      "Untracked line items (need product matching):",
      ...valid.map((li, i) => `  ${i + 1}. ${li.description}${li.sku ? ` [SKU: ${li.sku}]` : ""}  ×${li.quantity}  @$${(li.unitCostCents / 100).toFixed(2)}`),
    ].filter(Boolean).join("\n");

    createMutation.mutate({
      storeId,
      supplierId: supplierIdOverride.trim() || parsed?.supplierName?.trim() || undefined,
      notes: noteLines,
      lineItems: valid.map((li) => ({
        productId: 0, // sentinel: untracked, Merchant Bot matches later by SKU/description
        quantity: li.quantity,
        unitCostCents: li.unitCostCents,
      })),
    });
  };

  // ── Computed ────────────────────────────────────────────────────
  const total = useMemo(
    () => editedItems.reduce((sum, li) => sum + li.quantity * li.unitCostCents, 0),
    [editedItems],
  );

  // ── Render ──────────────────────────────────────────────────────

  // Step 1 — drop zone (no file yet)
  if (!file) {
    return (
      <div className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) acceptFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all ${
            isDragging
              ? "border-sky-400/60 bg-sky-500/[0.06]"
              : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
          }`}
          role="button"
          aria-label="Upload supplier receipt"
        >
          <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500/15 to-violet-500/10 border border-sky-500/20 flex items-center justify-center mb-1">
              <Upload className="h-5 w-5 text-sky-300" />
            </div>
            <p className="text-sm font-semibold text-white">Drop a receipt or PO confirmation</p>
            <p className="text-xs text-white/50">PDF · PNG · JPEG · WebP — up to 8MB</p>
            <p className="text-[11px] text-white/35 mt-1 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-300" />
              Claude vision extracts line items into a draft PO
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
              e.target.value = ""; // allow re-uploading same file
            }}
          />
        </div>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose} className="w-full">
            Cancel
          </Button>
        )}
      </div>
    );
  }

  // Step 2 — file selected, awaiting parse
  if (file && !parsed) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <FileText className="h-5 w-5 text-sky-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{file.name}</p>
            <p className="text-[11px] text-white/45">{(file.size / 1024).toFixed(0)} KB · {file.type.split("/")[1].toUpperCase()}</p>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="shrink-0 w-7 h-7 rounded-md text-white/60 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
            aria-label="Remove file"
          >
            <X className="h-3.5 h-3.5" />
          </button>
        </div>
        <Button
          onClick={handleParse}
          disabled={parseMutation.isPending}
          className="w-full bg-gradient-to-r from-sky-500 to-violet-600 hover:from-sky-400 hover:to-violet-500"
        >
          {parseMutation.isPending ? (
            <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Reading receipt…</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-2" />Extract with Claude vision</>
          )}
        </Button>
        {parseMutation.isPending && (
          <p className="text-[11px] text-center text-white/45 leading-snug">
            Vision parsing typically takes 8–20 seconds for a single-page document.
          </p>
        )}
      </div>
    );
  }

  // Step 3 — parsed, edit + commit
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20">
        <Check className="h-4 w-4 text-emerald-300" />
        <p className="text-xs text-emerald-100 flex-1">
          Extracted from <span className="font-mono">{file.name}</span>
          {parsed?.supplierName ? ` · ${parsed.supplierName}` : ""}
          {parsed?.documentNumber ? ` · ${parsed.documentNumber}` : ""}
        </p>
        <button
          type="button"
          onClick={() => { setFile(null); setParsed(null); setEditedItems([]); }}
          className="text-[11px] text-emerald-200/70 hover:text-emerald-100 underline"
        >
          Re-upload
        </button>
      </div>

      {/* Document-level fields */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/45">Date</span>
          <p className="text-white/85 font-medium">{parsed?.documentDate ?? "—"}</p>
        </div>
        <div className="px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/45">Doc total</span>
          <p className="text-white/85 font-medium font-mono">
            {parsed?.totalCents != null ? `$${(parsed.totalCents / 100).toFixed(2)}` : "—"}
          </p>
        </div>
      </div>

      {/* Line items — editable */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="px-3 py-2 bg-white/[0.025] border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
            Line items · {editedItems.length}
          </span>
          <span className="text-[10px] text-white/60 inline-flex items-center gap-1">
            <Pencil className="h-2.5 w-2.5" /> editable before commit
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
          {editedItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-white/45">
              <AlertCircle className="h-4 w-4 text-amber-300 mx-auto mb-2" />
              No line items extracted. Try a clearer scan or enter manually.
            </div>
          ) : (
            editedItems.map((li, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-2">
                <Input
                  value={li.description}
                  onChange={(e) => {
                    const next = [...editedItems];
                    next[i] = { ...li, description: e.target.value };
                    setEditedItems(next);
                  }}
                  className="flex-1 h-7 text-[12px]"
                  placeholder="Description"
                />
                <Input
                  type="number"
                  min={1}
                  value={li.quantity}
                  onChange={(e) => {
                    const next = [...editedItems];
                    next[i] = { ...li, quantity: Number(e.target.value) || 0 };
                    setEditedItems(next);
                  }}
                  className="w-16 h-7 text-[12px] font-mono text-right"
                />
                <span className="text-[11px] text-white/35 shrink-0">×</span>
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-white/35 pointer-events-none">$</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={(li.unitCostCents / 100).toFixed(2)}
                    onChange={(e) => {
                      const dollars = Number(e.target.value) || 0;
                      const next = [...editedItems];
                      next[i] = { ...li, unitCostCents: Math.round(dollars * 100) };
                      setEditedItems(next);
                    }}
                    className="pl-5 h-7 text-[12px] font-mono text-right"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEditedItems(editedItems.filter((_, idx) => idx !== i))}
                  className="shrink-0 w-6 h-6 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center"
                  aria-label="Remove line"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="px-3 py-2 bg-white/[0.025] border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">PO total</span>
          <span className="text-sm font-bold font-mono text-emerald-300">${(total / 100).toFixed(2)}</span>
        </div>
      </div>

      {/* Supplier hint (optional override) */}
      <Input
        placeholder={parsed?.supplierName ? `Supplier: ${parsed.supplierName} (override?)` : "Supplier ID (optional)"}
        value={supplierIdOverride}
        onChange={(e) => setSupplierIdOverride(e.target.value)}
        className="h-8 text-[12px]"
      />

      <div className="flex gap-2 pt-1">
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          onClick={handleCreate}
          disabled={editedItems.length === 0 || createMutation.isPending}
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-500"
        >
          {createMutation.isPending ? (
            <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Creating draft…</>
          ) : (
            <>Create draft PO</>
          )}
        </Button>
      </div>
    </div>
  );
}
