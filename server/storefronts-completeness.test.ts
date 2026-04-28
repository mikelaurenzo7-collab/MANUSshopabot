/**
 * Storefronts page — tab completeness regression guards.
 *
 * The Storefronts hub had two long-standing dead spots:
 *   1. The "Tools" tab inlined a copy of ToolsTab whose Connect
 *      button had no onClick handler — clicking did literally
 *      nothing. Replaced with the proper ToolsTab component from
 *      components/integrations/.
 *   2. The "Supplier POs" tab had a flat "No POs yet" empty state
 *      with no path forward. Replaced with a three-action grid
 *      (scan receipt / draft manually / run inventory check) plus
 *      a Scan-Receipt dialog wired to the new Claude vision
 *      parseReceiptDocument endpoint.
 *
 * These tests lock the fixes in by source-level pattern check.
 */
import { describe, it, expect } from "vitest";

describe("Storefronts page — tab completeness", () => {
  it("Tools tab uses the proper ToolsTab component (not the inline broken duplicate)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Storefronts.tsx"),
      "utf-8",
    );
    // Imports the proper component
    expect(src).toContain('import { ToolsTab } from "@/components/integrations/ToolsTab"');
    // No inline ToolsTab function declaration (the broken one)
    expect(src).not.toMatch(/^function ToolsTab\(\)/m);
    // The broken inline version had no onClick on Connect — make sure
    // we didn't regress to a hardcoded TOOL_CONFIGS array
    expect(src).not.toContain("const TOOL_CONFIGS =");
  });

  it("ToolsTab component (the proper one) wires Connect → API key dialog OR generateOAuthUrl", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/integrations/ToolsTab.tsx"),
      "utf-8",
    );
    // OAuth path
    expect(src).toContain("trpc.tools.generateOAuthUrl.useMutation");
    // API-key path needs a mutation hook too
    expect(src).toContain("connectWithApiKey");
    // Disconnect + health-check round out the tile actions
    expect(src).toContain("trpc.tools.disconnect.useMutation");
    expect(src).toContain("trpc.tools.checkHealth.useMutation");
  });
});

describe("Supplier POs tab — actionable empty states + receipt scanner", () => {
  it("includes the ReceiptUploader scan-receipt dialog", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/SupplierPOs.tsx"),
      "utf-8",
    );
    expect(src).toContain("ReceiptUploader");
    expect(src).toContain("scanDialogOpen");
    // Visible Scan-Receipt button next to New PO
    expect(src).toContain("Scan receipt");
  });

  it("no-store empty state offers a Connect-a-store CTA (not a dead-end)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/SupplierPOs.tsx"),
      "utf-8",
    );
    // The link target is the integrations tab where stores connect
    expect(src).toContain('href="/storefronts#integrations"');
    expect(src).toContain("Connect a store");
  });

  it("no-POs empty state offers three concrete next-actions", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/SupplierPOs.tsx"),
      "utf-8",
    );
    // Three buttons: scan / manual / run-inventory
    expect(src).toContain("Scan a receipt");
    expect(src).toContain("Draft manually");
    expect(src).toContain("Run inventory check");
  });

  it("ReceiptUploader uses productId: 0 sentinel for untracked items (not a hardcoded real ID)", async () => {
    // Pre-fix the uploader used productId: 1 as a placeholder, which
    // would silently attach receipt line items to whoever happened to
    // own product #1 in the DB. The sentinel pattern (productId: 0)
    // is the only safe value — tests guard against regression.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/supplier/ReceiptUploader.tsx"),
      "utf-8",
    );
    expect(src).toContain("productId: 0,");
    expect(src).not.toMatch(/productId:\s*1\s*[,/]/);
    // Server-side schema accepts the 0 sentinel.
    const serverSrc = fs.readFileSync(
      path.resolve(__dirname, "routers/supplier.ts"),
      "utf-8",
    );
    expect(serverSrc).toContain("productId: z.number().min(0)");
  });

  it("ReceiptUploader caps file size at 8MB to match the server", async () => {
    // Server enforces 8MB; client bouncing it pre-upload saves a
    // round-trip + base64 encode. Both sides must agree.
    const fs = await import("fs");
    const path = await import("path");
    const clientSrc = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/supplier/ReceiptUploader.tsx"),
      "utf-8",
    );
    const serverSrc = fs.readFileSync(
      path.resolve(__dirname, "routers/supplier.ts"),
      "utf-8",
    );
    expect(clientSrc).toContain("MAX_BYTES = 8 * 1024 * 1024");
    expect(serverSrc).toContain("8 * 1024 * 1024");
  });
});
