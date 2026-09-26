import type { Prisma } from "@prisma/client";

import { describeActivity } from "@/lib/activity-presentation";

export function incidentActorLabel(activity: {
  actorUserId: string | null;
  actorMember: { userId: string; acceptedInvitations: { email: string }[] } | null;
}, currentUser?: { id: string; name?: string | null; email: string } | null) {
  if (currentUser && activity.actorUserId === currentUser.id) return currentUser.name?.trim() || currentUser.email;
  return activity.actorMember?.acceptedInvitations[0]?.email
    ?? (activity.actorUserId ? `Usuario ${activity.actorUserId.slice(0, 8)}…` : "Sistema");
}

export function describeIncidentTimeline(action: string, metadata: Prisma.JsonValue | null) {
  return describeActivity(action, metadata);
}
