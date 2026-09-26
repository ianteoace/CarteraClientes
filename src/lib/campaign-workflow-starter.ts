import "server-only";

import { start } from "workflow/api";
import { scheduledCampaignWorkflow } from "@/workflows/scheduled-campaign";

export type ScheduledCampaignWorkflowInput = {
  campaignId: string;
  workspaceId: string;
  scheduleGeneration: string;
  scheduledAt: string;
};

export async function startScheduledCampaignWorkflow(input: ScheduledCampaignWorkflowInput) {
  return start(scheduledCampaignWorkflow, [input]);
}
