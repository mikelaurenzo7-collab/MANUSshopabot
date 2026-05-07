/**
 * WorkspaceSourcing — per-store supplier catalog browser.
 *
 * Renders the SupplierCatalogBrowser inside the workspace shell so
 * operators can browse Printful and CJ Dropshipping products for
 * their specific store without running a full workflow first.
 *
 * "Add to PO" flows into the supplier PO draft creation flow.
 */
import { toast } from "sonner";
import { WorkspaceShell, useWorkspaceStore } from "@/components/workspace/WorkspaceShell";
import {
  SupplierCatalogBrowser,
  type UnifiedProduct,
} from "@/components/supplier/SupplierCatalogBrowser";
import { trpc } from "@/lib/trpc";

export default function WorkspaceSourcing() {
  const { storeId } = useWorkspaceStore();

  const createDraftMutation = trpc.supplier.createDraft.useMutation({
    onSuccess: (data) => {
      toast.success(`PO Draft created — ${data.poNumber}`, {
        description: "Review and approve it in the Supplier POs page.",
      });
    },
    onError: (err) => {
      toast.error("Failed to create PO draft", { description: err.message });
    },
  });

  function handleAddToPO(product: UnifiedProduct) {
    if (!storeId) {
      toast.error("No store selected");
      return;
    }

    createDraftMutation.mutate({
      storeId,
      supplierId: product.supplier,
      notes: `Sourced from ${product.supplier === "printful" ? "Printful" : "CJ Dropshipping"} catalog: ${product.title}`,
      lineItems: [
        {
          productId: 0, // untracked — no internal product yet
          quantity: 1,
          unitCostCents: product.costCents ?? product.priceCents,
        },
      ],
    });
  }

  return (
    <WorkspaceShell activeTab="sourcing">
      <div className="flex flex-col h-full">
        <SupplierCatalogBrowser onAddToPO={handleAddToPO} />
      </div>
    </WorkspaceShell>
  );
}
