import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";

import { CampaignsTable } from "@/components/campaigns/campaigns-table";
import { listCampaigns } from "@/lib/campaign-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.CAMPAIGNS) || !hasPermission(context, WorkspacePermission.CAMPAIGN_VIEW)) notFound();
  const campaigns = await listCampaigns(context);

  return (
    <section className="app-page module-page">
      <PageHeader eyebrow="Comunicación" title="Campañas" metadata={`${campaigns.length} campañas`} actions={hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE) ? <Link className="btn-primary" href="/campanas/nueva">Nueva campaña</Link> : null} />
      <CampaignsTable campaigns={campaigns} />
    </section>
  );
}
