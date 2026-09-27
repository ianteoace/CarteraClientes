import "server-only";

import type { AuthorizationContext } from "@/lib/authorization";
import { getConversationScopeFilter, requireInboxAccess } from "@/lib/conversation-repository";
import { prisma } from "@/lib/prisma";

export async function getConversationAttachment(context: AuthorizationContext, id: string) {
  await requireInboxAccess(context);
  return prisma.whatsAppMessageAttachment.findFirst({
    where: { id, workspaceId: context.workspaceId, kind: "IMAGE", status: "READY", message: {
      workspaceId: context.workspaceId, direction: "INBOUND", type: "IMAGE",
      conversation: { is: getConversationScopeFilter(context) },
    } },
    select: { storagePath: true, mimeType: true, sizeBytes: true },
  });
}
