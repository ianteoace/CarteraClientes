import "server-only";

import type { AuthorizationContext } from "@/lib/authorization";
import { getConversationAttachment } from "@/lib/whatsapp/image-attachment-repository";
import { isWhatsAppImageMime, MAX_WHATSAPP_IMAGE_BYTES } from "@/lib/whatsapp/image-media";
import { readPrivateImage } from "@/lib/whatsapp/private-image-storage";

export async function serveConversationAttachment(context: AuthorizationContext | null, id: string, read = readPrivateImage) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
  if (!context) return new Response(null, { status: 401, headers });
  try {
    const attachment = await getConversationAttachment(context, id);
    if (!attachment || !isWhatsAppImageMime(attachment.mimeType)) return new Response(null, { status: 404, headers });
    const blob = await read(attachment.storagePath);
    if (!blob || blob.statusCode !== 200 || blob.blob.contentType !== attachment.mimeType || blob.blob.size > MAX_WHATSAPP_IMAGE_BYTES || blob.blob.size !== attachment.sizeBytes) return new Response(null, { status: 404, headers });
    return new Response(blob.stream, { headers: {
      ...headers, "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="image.${attachment.mimeType === "image/png" ? "png" : "jpg"}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new Response(null, { status: 404, headers }); }
}
