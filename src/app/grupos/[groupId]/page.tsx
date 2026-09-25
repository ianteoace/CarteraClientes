import { notFound } from "next/navigation";

import { GroupMembersManager } from "@/components/groups/group-members-manager";
import { listClients } from "@/lib/client-repository";
import { getGroupDetails } from "@/lib/group-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";

export const dynamic = "force-dynamic";

type GroupPageProps = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.GROUP_VIEW)) notFound();
  const canSeeContacts = hasPermission(context, WorkspacePermission.CONTACT_VIEW);
  const [group, clients] = await Promise.all([
    getGroupDetails(context, groupId),
    canSeeContacts ? listClients(context) : Promise.resolve([]),
  ]);

  if (!group) {
    notFound();
  }

  return <GroupMembersManager clients={clients} group={group} canViewContacts={canSeeContacts} canManageMembers={canSeeContacts && hasPermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS)} />;
}
