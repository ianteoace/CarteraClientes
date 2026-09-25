import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_SEND_COOLDOWN_MS = 60 * 1000;
export const INVITATION_HOURLY_LIMIT = 20;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}
