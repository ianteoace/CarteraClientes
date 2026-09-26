import type { Metadata } from "next";
import { AuthNavigation } from "@/components/auth/auth-navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContextIfAvailable, hasAllGroups, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "Billetera de Clientes",
  description: "Base inicial para gestionar clientes y grupos.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const context = user ? await getAuthorizationContextIfAvailable(user.id) : null;
  const visible = context ? {
    contacts: hasPermission(context, WorkspacePermission.CONTACT_VIEW),
    groups: hasPermission(context, WorkspacePermission.GROUP_VIEW),
    campaigns: hasPermission(context, WorkspacePermission.CAMPAIGN_VIEW),
    tickets: hasPermission(context, WorkspacePermission.TICKET_VIEW),
    incidents: hasPermission(context, WorkspacePermission.INCIDENT_VIEW) && hasAllGroups(context),
    team: hasPermission(context, WorkspacePermission.TEAM_VIEW),
    activity: hasPermission(context, WorkspacePermission.TEAM_VIEW),
    settings: hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_VIEW),
  } : undefined;
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className={`min-h-full${context ? " signed-in" : ""}`}><AuthNavigation accountName={context?.workspace.name} visible={visible} /><div className="app-content">{children}</div></body>
    </html>
  );
}
