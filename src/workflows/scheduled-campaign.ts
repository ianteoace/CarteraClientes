import { sleep } from "workflow";

import { processClaimedCampaign } from "../lib/campaign-send-service";
import { claimScheduledCampaignForSending } from "../lib/campaign-send-repository";
import type { ScheduledCampaignWorkflowInput } from "../lib/campaign-workflow-starter";

export async function scheduledCampaignWorkflow(input: ScheduledCampaignWorkflowInput) {
  "use workflow";

  await sleep(new Date(input.scheduledAt));
  const claimed = await claimScheduledCampaignStep(input);
  if (!claimed) return { claimed: false };

  const summary = await processScheduledCampaignStep(input);
  return { claimed: true, summary };
}

export async function claimScheduledCampaignStep(input: ScheduledCampaignWorkflowInput) {
  "use step";

  return claimScheduledCampaignForSending({
    ...input,
    scheduledAt: new Date(input.scheduledAt),
  });
}

export async function processScheduledCampaignStep(input: ScheduledCampaignWorkflowInput) {
  "use step";

  return processClaimedCampaign({
    workspaceId: input.workspaceId,
    actorUserId: null,
    actorMemberId: null,
  }, input.campaignId);
}
