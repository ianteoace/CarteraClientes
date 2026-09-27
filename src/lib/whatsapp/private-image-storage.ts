import "server-only";

import { BlobNotFoundError, get, head, put } from "@vercel/blob";

export interface PrivateImageStorage {
  stat(path: string): Promise<{ sizeBytes: number; mimeType: string } | null>;
  upload(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
}

function options() {
  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (!storeId) throw new Error("Private WhatsApp storage requires BLOB_STORE_ID");
  // The SDK resolves and refreshes Vercel OIDC itself. Never capture an OIDC token.
  return { storeId, abortSignal: AbortSignal.timeout(25_000) };
}

export const privateImageStorage: PrivateImageStorage = {
  async stat(path) {
    try {
      const blob = await head(path, options());
      if (!new URL(blob.url).hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error("Private storage required");
      return { sizeBytes: blob.size, mimeType: blob.contentType };
    } catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
  },
  async upload(path, bytes, mimeType) {
    const blob = await put(path, Buffer.from(bytes), {
      ...options(), access: "private", contentType: mimeType, addRandomSuffix: false, allowOverwrite: false,
    });
    if (blob.pathname !== path || !new URL(blob.url).hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error("Private storage required");
  },
};

export function readPrivateImage(path: string) {
  return get(path, { ...options(), access: "private", useCache: false });
}
