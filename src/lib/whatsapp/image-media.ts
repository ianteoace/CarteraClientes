import { createHash, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API's documented image media limit: 5 MB, JPEG/PNG only.
export const MAX_WHATSAPP_IMAGE_BYTES = 5 * 1024 * 1024;
export const WHATSAPP_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export class WhatsAppMediaError extends Error {
  constructor(readonly reason: string, readonly retryable = false) {
    super(`WhatsApp image processing failed: ${reason}`);
  }
}

export function isWhatsAppImageMime(value: string): value is typeof WHATSAPP_IMAGE_MIME_TYPES[number] {
  return WHATSAPP_IMAGE_MIME_TYPES.some((mime) => mime === value);
}

export function verifyWhatsAppImage(bytes: Uint8Array, mimeType: string, checksums: Array<string | null | undefined>) {
  if (!bytes.length || bytes.length > MAX_WHATSAPP_IMAGE_BYTES) throw new WhatsAppMediaError("INVALID_SIZE");
  const signature = mimeType === "image/png"
    ? Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!signature) throw new WhatsAppMediaError("INVALID_MIME");
  const actual = createHash("sha256").update(bytes).digest();
  for (const expected of checksums.filter(Boolean) as string[]) {
    const decoded = /^[0-9a-f]{64}$/i.test(expected) ? Buffer.from(expected, "hex")
      : /^[A-Za-z0-9+/]{43}=$/.test(expected) ? Buffer.from(expected, "base64") : null;
    if (!decoded || decoded.length !== actual.length || !timingSafeEqual(decoded, actual)) throw new WhatsAppMediaError("CHECKSUM_MISMATCH");
  }
  return actual.toString("base64");
}

export function attachmentStoragePath(workspaceId: string, conversationId: string, messageId: string, attachmentId: string) {
  return `whatsapp/${workspaceId}/${conversationId}/${messageId}/${attachmentId}`;
}
