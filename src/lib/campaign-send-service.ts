import "server-only";

import { WorkspacePermission } from "@prisma/client";
import { requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { personalizeMessage } from "@/lib/campaign-message";
import {
  claimCampaignForSending,
  claimRecipientForSending,
  finalizeCampaignSending,
  getCampaignPendingRecipients,
  markRecipientAccepted,
  markRecipientFailed,
  failCampaignBeforeDispatch,
  type CampaignExecutionContext,
} from "@/lib/campaign-send-repository";
import type { MessageProvider } from "@/lib/messaging/message-provider";
import { MockMessageProvider } from "@/lib/messaging/mock-message-provider";
import { MetaWhatsAppProvider } from "@/lib/messaging/meta-whatsapp-provider";
import { WhatsAppApiError, WhatsAppCloudApiClient } from "@/lib/whatsapp/client";
import { analyzeTemplate, campaignDeliveryMode, readFrozenParameters, templatePreview } from "@/lib/campaign-delivery";
import { getCampaignMetaConnection, requireApprovedTemplate, type TemplateCatalogClient } from "@/lib/campaign-template-service";
import { acceptCampaignOutbound, createCampaignOutboundIntent, failCampaignOutbound } from "@/lib/campaign-meta-send-repository";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export class CampaignSendError extends Error {}
type CampaignSendDependencies = { catalog?: TemplateCatalogClient; metaProvider?: Pick<MetaWhatsAppProvider, "sendTemplateMessage"> };

function requireSafeCampaignProvider(provider: MessageProvider) {
  if (!provider.supportsFreeformCampaigns) {
    throw new CampaignSendError("Este proveedor no admite campañas de texto libre. Elegí una plantilla aprobada para WhatsApp real.");
  }
}

function safeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "El proveedor rechazó el mensaje.";
  return message.slice(0, 500);
}

export async function sendCampaign(
  context: AuthorizationContext, campaignId: string,
  provider?: MessageProvider,
  dependencies: CampaignSendDependencies = {},
) {
  if (provider) requireSafeCampaignProvider(provider);
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);
  const claim = await claimCampaignForSending(context, campaignId);

  if (claim.count !== 1) {
    throw new CampaignSendError("La campaña debe estar lista y no haber sido procesada anteriormente.");
  }

  return processClaimedCampaign({
    workspaceId: context.workspaceId,
    actorUserId: context.userId,
    actorMemberId: context.memberId,
  }, campaignId, provider, dependencies);
}

export async function processClaimedCampaign(
  context: CampaignExecutionContext,
  campaignId: string,
  provider?: MessageProvider,
  dependencies: CampaignSendDependencies = {},
) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);

  const campaign = await getCampaignPendingRecipients(context, campaignId);

  if (!campaign || !campaign.recipients.length) {
    return finalizeCampaignSending(context, campaignId);
  }

  const mode = campaignDeliveryMode(campaign.deliveryMode);
  const mock = mode === "MOCK" ? provider ?? new MockMessageProvider() : undefined;
  if (mock) requireSafeCampaignProvider(mock);
  let meta: Pick<MetaWhatsAppProvider, "sendTemplateMessage"> | undefined;
  let analysis: ReturnType<typeof analyzeTemplate> | undefined;
  const snapshot = campaign.whatsAppTemplate;
  if (mode === "META_WHATSAPP") {
    try {
      if (!snapshot?.whatsappConnectionId) throw new Error("Missing campaign template connection");
      const { configuration } = await getCampaignMetaConnection(context.workspaceId, snapshot.whatsappConnectionId);
      const client = new WhatsAppCloudApiClient(configuration);
      const catalog = dependencies.catalog ?? client;
      const current = requireApprovedTemplate(await catalog.listTemplates(snapshot.templateName), snapshot.templateName, snapshot.language, snapshot.metaTemplateId);
      analysis = analyzeTemplate({ category: snapshot.category, components: snapshot.componentsSnapshot as unknown[] });
      if (!analysis.compatible || current.template.category !== snapshot.category || JSON.stringify(current.analysis) !== JSON.stringify(analysis)) throw new Error("Template changed after preparation");
      for (const recipient of campaign.recipients) readFrozenParameters(recipient.templateParameters, analysis.variables.length);
      meta = dependencies.metaProvider ?? new MetaWhatsAppProvider(client);
    } catch {
      return failCampaignBeforeDispatch(context, campaignId);
    }
  }

  for (const recipient of campaign.recipients) {
    const recipientClaim = await claimRecipientForSending(context, campaignId, recipient.id);

    if (recipientClaim.count !== 1) {
      continue;
    }

    if (meta && snapshot?.whatsappConnectionId && analysis) {
      let intentId: string | null = null;
      try {
        const parameters = readFrozenParameters(recipient.templateParameters, analysis.variables.length);
        const intent = await createCampaignOutboundIntent(context, campaignId, recipient.id, snapshot.whatsappConnectionId, templatePreview(analysis, parameters));
        intentId = intent.id;
        if (!intent.created) continue; // A persisted intention is never retransmitted after a crash/retry.
        const result = await meta.sendTemplateMessage({ phone: recipient.phoneSnapshot, recipientFormat: "internal", templateName: snapshot.templateName, languageCode: snapshot.language,
          parameters, clientRequestId: intent.clientRequestId!, signal: AbortSignal.timeout(15_000) });
        await acceptCampaignOutbound(context, recipient.id, intent.id, result);
      } catch (error) {
        const ambiguous = !(error instanceof WhatsAppApiError) || error.httpStatus === 0 || error.httpStatus < 400 || error.httpStatus >= 500;
        await failCampaignOutbound(context, recipient.id, intentId, ambiguous, ambiguous ? "UNCONFIRMED" : String(error.metaCode ?? error.httpStatus));
      }
      continue;
    }
    try {
      const result = await mock!.sendMessage({
        phone: recipient.phoneSnapshot,
        recipientName: recipient.nameSnapshot,
        message: personalizeMessage(campaign.message, recipient.nameSnapshot),
      });

      await markRecipientAccepted(context, campaignId, recipient.id, result.providerMessageId, result.acceptedAt);
    } catch (error) {
      await markRecipientFailed(context, campaignId, recipient.id, safeProviderError(error));
    }
  }

  return finalizeCampaignSending(context, campaignId);
}
