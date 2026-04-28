/**
 * Anthropic Files API helper — vision + document upload.
 *
 * The Files API lets you upload an image or document once and
 * reference it across many requests by `file_id`, instead of
 * re-base64-encoding the bytes into every prompt. Use cases that
 * actually pay off:
 *
 *   • Supplier-doc parsing (Merchant Bot): upload a PO/receipt PDF
 *     once, run extraction + classification + line-item parsing as
 *     three separate Claude calls without re-uploading.
 *   • Product-image vision (Builder Bot): upload a product photo,
 *     ask Claude to write a listing description, then (separate
 *     call) fact-check it against the same image.
 *   • Reference catalog: upload a brand-style PDF once at org
 *     onboarding, every brand_identity_kit / store_setup workflow
 *     references it.
 *
 * Activation: opt-in via `ANTHROPIC_API_KEY`. When unset, callers
 * should fall back to inline base64 (the existing path through the
 * Forge proxy). The Files API is beta — pass
 * `betas: ["files-api-2025-04-14"]` per the SDK contract.
 *
 * Pricing: file operations (upload, list, delete) are free; content
 * used in messages is billed as input tokens. Files persist until
 * deleted; max 500MB per file, 100GB per org.
 */

import { isClaudeDirectAvailable } from "./claudeDirect";
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — the Files API path requires the direct SDK. Fall back to inline base64 via the Forge proxy.",
    );
  }
  _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  return _client;
}

export interface UploadedFile {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Upload bytes to the Anthropic Files API. Caller passes:
 *   - filename: the human-facing name (used in citations + UI)
 *   - bytes: a Buffer / Uint8Array / Blob — anything the SDK's
 *     `Anthropic.toFile()` helper accepts
 *   - mimeType: required so vision blocks know what to render
 *
 * Returns the file_id which the caller stores and references in
 * subsequent message blocks.
 */
export async function uploadFile(args: {
  filename: string;
  bytes: Buffer | Uint8Array;
  mimeType: string;
}): Promise<UploadedFile> {
  const client = getClient();
  const file = await client.beta.files.upload({
    file: await Anthropic.toFile(args.bytes, args.filename, { type: args.mimeType }),
    betas: ["files-api-2025-04-14"],
  });
  return {
    id: file.id,
    filename: file.filename,
    sizeBytes: file.size_bytes,
    mimeType: file.mime_type,
  };
}

/**
 * Run a vision query against a previously-uploaded image file_id.
 * Returns the text response. Common use:
 *
 *   const f = await uploadFile({ filename: "po.pdf", bytes, mimeType: "application/pdf" });
 *   const json = await visionQuery({
 *     fileId: f.id,
 *     mimeType: "application/pdf",
 *     prompt: "Extract line items as JSON: [{sku, qty, unitCents}]",
 *     jsonSchema: { name: "line_items", schema: { ... } },
 *   });
 *
 * Streams when max_tokens > 16K to stay under the SDK's idle guard.
 */
export async function visionQuery(args: {
  fileId: string;
  mimeType: string;
  prompt: string;
  maxTokens?: number;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  cacheReferenceFile?: boolean;
}): Promise<{ text: string; json?: unknown; cacheReadInputTokens: number }> {
  const client = getClient();
  const maxTokens = args.maxTokens ?? 8000;
  // The reference-file content block. PDFs use "document"; images
  // use "image". The SDK accepts either as a file source.
  const refBlock =
    args.mimeType === "application/pdf"
      ? {
          type: "document" as const,
          source: { type: "file" as const, file_id: args.fileId },
          ...(args.cacheReferenceFile
            ? { cache_control: { type: "ephemeral" as const } }
            : {}),
        }
      : {
          type: "image" as const,
          source: { type: "file" as const, file_id: args.fileId },
        };

  const message = await client.beta.messages.create({
    model: ENV.anthropicModel,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      ...(args.jsonSchema
        ? {
            format: {
              type: "json_schema" as const,
              schema: args.jsonSchema.schema,
            },
          }
        : {}),
    },
    messages: [
      {
        role: "user",
        content: [refBlock, { type: "text", text: args.prompt }],
      },
    ],
    betas: ["files-api-2025-04-14"],
  });

  let text = "";
  for (const block of message.content) {
    if (block.type === "text") text += block.text;
  }

  let json: unknown;
  if (args.jsonSchema && text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Schema enforcement should make this impossible; fall through.
    }
  }

  return {
    text,
    ...(json !== undefined ? { json } : {}),
    cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * Delete a file. Cleanup helper — on-platform docs (style guides,
 * supplier reference PDFs) typically stay; one-off uploads (a single
 * receipt) should be deleted after the workflow completes.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const client = getClient();
  await client.beta.files.delete(fileId, {
    betas: ["files-api-2025-04-14"],
  });
}

/** Whether the Files API path is available (same gate as claudeDirect). */
export function isFilesApiAvailable(): boolean {
  return isClaudeDirectAvailable();
}
