import { normalizeOptionalEmail } from "@/lib/email";
import { EmailInboundPayloadError } from "@/lib/email-inbound/types";

export function parseMailbox(value: unknown) {
  if (typeof value !== "string" || value.length > 1000) throw new EmailInboundPayloadError();
  const match = value.trim().match(/^(.*?)\s*<([^<>]+)>$/);
  const address = normalizeOptionalEmail(match ? match[2] : value);
  if (!address) throw new EmailInboundPayloadError();
  return { address, name: match?.[1].trim().replace(/^"|"$/g, "").slice(0, 255) || null };
}

export function mailboxAddresses(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new EmailInboundPayloadError();
  return [...new Set(value.map((entry) => parseMailbox(entry).address))];
}

export function emailMessageIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  // Message IDs are opaque: preserve case and do not use subjects as identities.
  return [...new Set((value.slice(0, 16000).match(/<[^<>\s]{1,998}>/g) ?? []))].slice(0, 50);
}

/** Text extraction only. The result is rendered as React text, never HTML. */
export function safeEmailText(text: string | null, html: string | null): string {
  if (text?.trim()) return text;
  if (!html) return "";
  const plain = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|form|object|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*(?:br\b[^>]*|\/(?:p|div|li|h[1-6]|tr))\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (raw, numeric: string | undefined, named: string | undefined) => {
      if (numeric) {
        const code = numeric[0].toLowerCase() === "x" ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[named?.toLowerCase() ?? ""] ?? raw;
    });
  return plain.replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function readLimitedBody(source: { body: ReadableStream<Uint8Array> | null }, maxBytes: number) {
  if (!source.body) return "";
  const reader = source.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new EmailInboundPayloadError("Email demasiado grande.");
      }
      parts.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}
