import { createHmac, timingSafeEqual } from "node:crypto";

const META_SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

export function createWhatsAppWebhookSignature(rawBody: Uint8Array, appSecret: string) {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

export function verifyWhatsAppWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string,
) {
  const signatureMatch = signatureHeader?.match(META_SIGNATURE_PATTERN);
  if (!signatureMatch) return false;

  const receivedDigest = Buffer.from(signatureMatch[1], "hex");
  const expectedDigest = createHmac("sha256", appSecret).update(rawBody).digest();

  return receivedDigest.length === expectedDigest.length
    && timingSafeEqual(receivedDigest, expectedDigest);
}
