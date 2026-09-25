import { GroupsManager } from "@/components/groups/groups-manager";
import { listGroups } from "@/lib/group-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.GROUP_VIEW)) notFound();
  const groups = await listGroups(context);

  return <GroupsManager groups={groups} permissions={{
    create: hasPermission(context, WorkspacePermission.GROUP_CREATE),
    edit: hasPermission(context, WorkspacePermission.GROUP_EDIT),
    delete: hasPermission(context, WorkspacePermission.GROUP_DELETE),
  }} />;
}
