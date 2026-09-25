export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function getInvitationStatus(invitation: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}, now = new Date()): InvitationStatus {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.expiresAt <= now) return "EXPIRED";
  return "PENDING";
}

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptada",
  REVOKED: "Revocada",
  EXPIRED: "Vencida",
};
