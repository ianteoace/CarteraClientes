import { notFound } from "next/navigation";

import { CampaignDetail } from "@/components/campaigns/campaign-detail";
import { getCampaignDetails } from "@/lib/campaign-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { campaignId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.CAMPAIGNS) || !hasPermission(context, WorkspacePermission.CAMPAIGN_VIEW)) notFound();
  const campaign = await getCampaignDetails(context, campaignId);

  if (!campaign) {
    notFound();
  }

  return <CampaignDetail campaign={campaign} canEdit={hasPermission(context, WorkspacePermission.CAMPAIGN_EDIT)} canSend={hasPermission(context, WorkspacePermission.CAMPAIGN_SEND)} />;
}
