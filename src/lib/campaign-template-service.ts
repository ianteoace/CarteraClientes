import "server-only";

import { WorkspacePermission, type Prisma } from "@prisma/client";
import { hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { analyzeTemplate, CampaignTemplateError, validateMapping, type CampaignTemplateSelection, type MetaTemplate } from "@/lib/campaign-delivery";
import { getWhatsAppConfiguration } from "@/lib/whatsapp/config";
import { WhatsAppCloudApiClient } from "@/lib/whatsapp/client";

export const CAMPAIGN_CONNECTION_UNCONFIGURED = "Esta conexión todavía no tiene credenciales de envío configuradas.";
export type TemplateCatalogClient = Pick<WhatsAppCloudApiClient, "listTemplates">;

export async function getCampaignMetaConnection(workspaceId: string, connectionId: string) {
  const connection = await prisma.whatsAppConnection.findFirst({ where: { id: connectionId, workspaceId, status: "ACTIVE" } });
  if (!connection) throw new CampaignTemplateError("La conexión de WhatsApp no está disponible para esta cartera.");
  let configuration: ReturnType<typeof getWhatsAppConfiguration>;
  try { configuration = getWhatsAppConfiguration(); } catch { throw new CampaignTemplateError(CAMPAIGN_CONNECTION_UNCONFIGURED); }
  if (connection.phoneNumberId !== configuration.phoneNumberId || connection.wabaId !== configuration.wabaId) throw new CampaignTemplateError(CAMPAIGN_CONNECTION_UNCONFIGURED);
  return { connection, configuration };
}

export async function getCampaignMetaAvailability(context: AuthorizationContext) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  if (!hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE)) requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  const connections = await prisma.whatsAppConnection.findMany({ where: { workspaceId: context.workspaceId, status: "ACTIVE" }, select: { id: true, phoneNumberId: true, wabaId: true } });
  try {
    const config = getWhatsAppConfiguration();
    const connection = connections.find((item) => item.phoneNumberId === config.phoneNumberId && item.wabaId === config.wabaId);
    if (connection) return { available: true as const, connectionId: connection.id, reason: null };
  } catch { /* No Meta credentials needed for Mock. */ }
  return { available: false as const, connectionId: null, reason: connections.length ? CAMPAIGN_CONNECTION_UNCONFIGURED : "Esta cartera no tiene una conexión WhatsApp activa." };
}

export async function getCampaignTemplateCatalog(context: AuthorizationContext, connectionId: string, catalog?: TemplateCatalogClient) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  if (!hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE)) requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  const { configuration } = await getCampaignMetaConnection(context.workspaceId, connectionId);
  const templates = await (catalog ?? new WhatsAppCloudApiClient(configuration)).listTemplates();
  return templates.map((template) => ({ name: template.name, language: template.language, category: template.category,
    status: template.status, components: template.components, parameter_format: template.parameter_format,
    analysis: analyzeTemplate(template) }));
}

export function requireApprovedTemplate(templates: MetaTemplate[], name: string, language: string, expectedId?: string | null) {
  const matches = templates.filter((template) => template.name === name && template.language === language && (!expectedId || template.id === expectedId));
  if (matches.length !== 1 || matches[0].status !== "APPROVED") throw new CampaignTemplateError("La plantilla ya no está disponible o aprobada en WhatsApp.");
  const template = matches[0];
  const analysis = analyzeTemplate(template);
  if (!analysis.compatible) throw new CampaignTemplateError(analysis.reason!);
  return { template, analysis };
}

export async function prepareCampaignTemplate(workspaceId: string, input: CampaignTemplateSelection, catalog?: TemplateCatalogClient) {
  const { configuration } = await getCampaignMetaConnection(workspaceId, input.connectionId);
  const { template, analysis } = requireApprovedTemplate(await (catalog ?? new WhatsAppCloudApiClient(configuration)).listTemplates(input.templateName), input.templateName, input.language);
  const mapping = validateMapping(input.mapping, analysis.variables);
  return {
    body: analysis.body,
    snapshot: {
      whatsappConnectionId: input.connectionId, metaTemplateId: template.id ?? null,
      templateName: template.name, language: template.language, category: template.category,
      componentsSnapshot: template.components as Prisma.InputJsonValue,
      parameterMapping: mapping as Prisma.InputJsonValue,
    },
  };
}
