import "server-only";

import { randomUUID } from "node:crypto";
import { WorkspacePermission } from "@prisma/client";

import { requirePermission, type AuthorizationContext } from "@/lib/authorization";
import {
  CampaignScheduleStateError,
  cancelCampaignSchedule as cancelCampaignScheduleInRepository,
  compensateCampaignSchedule,
  prepareCampaignSchedule,
} from "@/lib/campaign-schedule-repository";
import {
  startScheduledCampaignWorkflow,
  type ScheduledCampaignWorkflowInput,
} from "@/lib/campaign-workflow-starter";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

const PUBLIC_MINIMUM_LEAD_MS = 60_000;

export class CampaignScheduleValidationError extends Error {}
export class CampaignWorkflowStartError extends Error {}

type ScheduleCampaignInput = {
  scheduledAt: string;
  timezone: string;
};

type ScheduleCampaignDependencies = {
  now?: Date;
  minimumLeadMs?: number;
  startWorkflow?: (input: ScheduledCampaignWorkflowInput) => Promise<unknown>;
};

function normalizeScheduleInput(
  input: ScheduleCampaignInput,
  now: Date,
  minimumLeadMs: number,
) {
  const scheduledAt = new Date(input.scheduledAt);
  const timezone = input.timezone.trim();

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new CampaignScheduleValidationError("Ingresá una fecha y hora válidas.");
  }
  if (!timezone || timezone.length > 100) {
    throw new CampaignScheduleValidationError("La zona horaria no es válida.");
  }
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: timezone }).format(now);
  } catch {
    throw new CampaignScheduleValidationError("La zona horaria no es válida.");
  }
  if (scheduledAt.getTime() < now.getTime() + minimumLeadMs) {
    throw new CampaignScheduleValidationError("Programá el envío con al menos un minuto de anticipación.");
  }

  return { scheduledAt, scheduledTimezone: timezone };
}

export async function scheduleCampaign(
  context: AuthorizationContext,
  campaignId: string,
  input: ScheduleCampaignInput,
  dependencies: ScheduleCampaignDependencies = {},
) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);
  const now = dependencies.now ?? new Date();
  const normalized = normalizeScheduleInput(
    input,
    now,
    dependencies.minimumLeadMs ?? PUBLIC_MINIMUM_LEAD_MS,
  );
  const prepared = await prepareCampaignSchedule(context, campaignId, {
    ...normalized,
    scheduleGeneration: randomUUID(),
  });
  const workflowInput: ScheduledCampaignWorkflowInput = {
    campaignId: prepared.campaignId,
    workspaceId: prepared.workspaceId,
    scheduleGeneration: prepared.scheduleGeneration,
    scheduledAt: prepared.scheduledAt.toISOString(),
  };

  try {
    await (dependencies.startWorkflow ?? startScheduledCampaignWorkflow)(workflowInput);
  } catch {
    await compensateCampaignSchedule(prepared);
    throw new CampaignWorkflowStartError(
      prepared.previous.status === "SCHEDULED"
        ? "No se pudo reprogramar el envío. Se restauró la programación anterior."
        : "No se pudo programar el envío. La campaña volvió a estar lista.",
    );
  }

  return workflowInput;
}

export async function cancelScheduledCampaign(context: AuthorizationContext, campaignId: string) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);
  return cancelCampaignScheduleInRepository(context, campaignId);
}

export { CampaignScheduleStateError };
