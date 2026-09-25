import Link from "next/link";

import { CampaignsTable } from "@/components/campaigns/campaigns-table";
import { listCampaigns } from "@/lib/campaign-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.CAMPAIGN_VIEW)) notFound();
  const campaigns = await listCampaigns(context);

  return (
    <section className="app-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campañas</h1>
          <p className="mt-1 text-sm text-zinc-600">Campañas preparadas para un futuro envío.</p>
        </div>
        {hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE) ? <Link className="btn-primary" href="/campanas/nueva">
          Nueva campaña
        </Link> : null}
      </div>
      <CampaignsTable campaigns={campaigns} />
    </section>
  );
}
