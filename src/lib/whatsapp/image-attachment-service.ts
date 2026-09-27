import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { WhatsAppCloudApiClient } from "@/lib/whatsapp/client";
import { isWhatsAppImageMime, MAX_WHATSAPP_IMAGE_BYTES, WhatsAppMediaError } from "@/lib/whatsapp/image-media";
import { privateImageStorage, type PrivateImageStorage } from "@/lib/whatsapp/private-image-storage";

export class ImageAttachmentRetryError extends Error {
  constructor() { super("Image attachment processing will be retried by the webhook"); }
}

type MediaReader = Pick<WhatsAppCloudApiClient, "retrieveImage">;
const MAX_ATTEMPTS = 5;
const TERMINAL_FAILURES = ["INVALID_MEDIA", "INVALID_MEDIA_URL", "INVALID_SIZE", "INVALID_MIME", "CHECKSUM_MISMATCH"];

export async function processInboundImage(providerMessageId: string, phoneNumberId: string, dependencies: { storage?: PrivateImageStorage; media?: MediaReader } = {}) {
  const attachment = await prisma.whatsAppMessageAttachment.findFirst({
    where: { kind: "IMAGE", message: { providerMessageId, phoneNumberId, direction: "INBOUND", type: "IMAGE", connection: { is: { phoneNumberId } } } },
    select: { id: true, status: true, attempts: true, processingExpiresAt: true, failureCode: true, mimeType: true, metaMediaId: true, sha256: true, storagePath: true },
  });
  if (!attachment || attachment.status === "READY") return;
  if (attachment.attempts >= MAX_ATTEMPTS) {
    if (attachment.status === "PROCESSING") {
      const expired = await prisma.whatsAppMessageAttachment.updateMany({
        where: { id: attachment.id, status: "PROCESSING", processingExpiresAt: { lt: new Date() } },
        data: { status: "FAILED", failureCode: "ATTEMPTS_EXHAUSTED", processingToken: null, processingExpiresAt: null },
      });
      if (!expired.count) throw new ImageAttachmentRetryError();
    }
    return;
  }
  if (attachment.failureCode && TERMINAL_FAILURES.includes(attachment.failureCode)) return;
  const token = randomUUID();
  const now = new Date();
  const claimed = await prisma.whatsAppMessageAttachment.updateMany({
    where: { id: attachment.id, attempts: { lt: MAX_ATTEMPTS }, OR: [
      { status: { in: ["PENDING", "FAILED"] } },
      { status: "PROCESSING", processingExpiresAt: { lt: now } },
    ] },
    data: { status: "PROCESSING", processingToken: token, processingExpiresAt: new Date(now.getTime() + 120_000), attempts: { increment: 1 }, failureCode: null },
  });
  if (!claimed.count) throw new ImageAttachmentRetryError();
  try {
    const storage = dependencies.storage ?? privateImageStorage;
    // Recover an acknowledged/ambiguous prior upload before downloading again.
    let stored = await storage.stat(attachment.storagePath);
    let checksum = attachment.sha256;
    if (!stored) {
      if (!attachment.metaMediaId || !isWhatsAppImageMime(attachment.mimeType)) throw new WhatsAppMediaError("INVALID_MEDIA");
      const media = await (dependencies.media ?? new WhatsAppCloudApiClient()).retrieveImage(attachment.metaMediaId, phoneNumberId, { mimeType: attachment.mimeType, sha256: attachment.sha256 });
      await storage.upload(attachment.storagePath, media.bytes, media.mimeType);
      stored = { sizeBytes: media.sizeBytes, mimeType: media.mimeType };
      checksum = media.sha256;
    }
    if (stored.mimeType !== attachment.mimeType || stored.sizeBytes <= 0 || stored.sizeBytes > MAX_WHATSAPP_IMAGE_BYTES) throw new WhatsAppMediaError("INVALID_MEDIA");
    const saved = await prisma.whatsAppMessageAttachment.updateMany({
      where: { id: attachment.id, status: "PROCESSING", processingToken: token },
      data: { status: "READY", sizeBytes: stored.sizeBytes, sha256: checksum, processingToken: null, processingExpiresAt: null, failureCode: null },
    });
    if (!saved.count) throw new ImageAttachmentRetryError();
    console.info("WhatsApp image processed", { messageId: providerMessageId.slice(0, 10), mediaType: attachment.mimeType, result: "READY" });
  } catch (error) {
    const failureCode = error instanceof WhatsAppMediaError ? error.reason : "STORAGE_OR_CONFIGURATION_FAILED";
    const saved = await prisma.whatsAppMessageAttachment.updateMany({
      where: { id: attachment.id, processingToken: token },
      data: { status: "FAILED", failureCode, processingToken: null, processingExpiresAt: null },
    });
    console.info("WhatsApp image processed", { messageId: providerMessageId.slice(0, 10), mediaType: attachment.mimeType, result: "FAILED", failureCode });
    const retryable = !(error instanceof WhatsAppMediaError) || error.retryable;
    if (!saved.count || (retryable && attachment.attempts + 1 < MAX_ATTEMPTS)) throw new ImageAttachmentRetryError();
  }
}
