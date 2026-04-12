import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Truck,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from "lucide-react";

const statusIcon: Record<string, any> = {
  draft: Clock,
  approved: FileCheck,
  submitted: Truck,
  fulfilled: CheckCircle2,
};

const statusColor: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  approved: "bg-blue-100 text-blue-800",
  submitted: "bg-yellow-100 text-yellow-800",
  fulfilled: "bg-green-100 text-green-800",
};

export default function SupplierPOs() {
  const [selectedStoreId] = useState<number | null>(null);
  const stores = trpc.stores.list.useQuery();
  const storeId = selectedStoreId || (stores.data as any)?.[0]?.id;

  const pos = trpc.supplier.listPOs.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );

  const approveMutation = trpc.supplier.approve.useMutation({
    onSuccess: () => pos.refetch(),
  });
  const submitMutation = trpc.supplier.submit.useMutation({
    onSuccess: () => pos.refetch(),
  });
  const fulfillMutation = trpc.supplier.markFulfilled.useMutation({
    onSuccess: () => pos.refetch(),
  });

  if (stores.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-orange-500" />
            Supplier Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your Merchant Bot auto-drafts POs when inventory runs low. Review, approve, and submit.
          </p>
        </div>
      </div>

      {!storeId ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto text-yellow-500 mb-3" />
            <p className="text-sm text-muted-foreground">
              No store connected yet. Connect a store to start managing purchase orders.
            </p>
          </CardContent>
        </Card>
      ) : !pos.data?.length ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No Purchase Orders Yet</p>
            <p className="text-sm text-muted-foreground">
              When the Merchant Bot detects low inventory, it will automatically draft purchase orders here. 
              You can also create manual POs.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pos.data.map((po: any) => {
            const StatusIcon = statusIcon[po.status] || Clock;
            return (
              <Card key={po.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <StatusIcon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{po.poNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {po.supplierId ? `Supplier: ${po.supplierId}` : "No supplier assigned"} 
                           · ${(po.totalCents / 100).toFixed(2)}
                        </p>
                        {po.notes && (
                          <p className="text-xs text-muted-foreground italic mt-1">{po.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColor[po.status] || ""}>{po.status}</Badge>
                      {po.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate({ poId: po.id })}
                          disabled={approveMutation.isPending}
                        >
                          <FileCheck className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      )}
                      {po.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => submitMutation.mutate({ poId: po.id })}
                          disabled={submitMutation.isPending}
                        >
                          <Truck className="w-3 h-3 mr-1" /> Submit to Supplier
                        </Button>
                      )}
                      {po.status === "submitted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fulfillMutation.mutate({ poId: po.id })}
                          disabled={fulfillMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Received
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
