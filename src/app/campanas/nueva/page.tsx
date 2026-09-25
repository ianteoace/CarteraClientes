import { CampaignForm } from "@/components/campaigns/campaign-form";
import { listCampaignSourceGroups } from "@/lib/campaign-repository";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ manual?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE)) notFound();
  const groups = await listCampaignSourceGroups(context);

  const { manual } = await searchParams;
  return <CampaignForm groups={groups} manual={manual === "1"} />;
}
