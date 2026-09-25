import { ClientsManager } from "@/components/clients/clients-manager";
import { listClients } from "@/lib/client-repository";
import { listGroups } from "@/lib/group-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.CONTACT_VIEW)) notFound();
  const [clients, groups] = await Promise.all([
    listClients(context),
    hasPermission(context, WorkspacePermission.GROUP_VIEW) ? listGroups(context) : Promise.resolve([]),
  ]);

  return <ClientsManager clients={clients} groups={groups} permissions={{
    create: hasPermission(context, WorkspacePermission.CONTACT_CREATE),
    edit: hasPermission(context, WorkspacePermission.CONTACT_EDIT),
    delete: hasPermission(context, WorkspacePermission.CONTACT_DELETE),
    manageGroups: hasPermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS),
    createGroup: hasPermission(context, WorkspacePermission.GROUP_CREATE),
    createCampaign: hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE),
    groupRequired: context.groupScopeMode === "SELECTED" && context.role !== "OWNER",
  }} />;
}
