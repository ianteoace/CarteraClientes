import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { GroupScopeMode, WorkspaceRole, type Workspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthorizationContext } from "@/lib/authorization";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { analyzeTemplate, campaignDeliveryMode, resolveTemplateParameters, validateMapping, type MetaTemplate, type ParameterMapping } from "@/lib/campaign-delivery";
import { createManualCampaign, getCampaignDetails, markCampaignReady, updateCampaignTemplateDraft } from "@/lib/campaign-repository";
import { getCampaignMetaAvailability, getCampaignMetaConnection, getCampaignTemplateCatalog, requireApprovedTemplate } from "@/lib/campaign-template-service";
import { processClaimedCampaign, sendCampaign } from "@/lib/campaign-send-service";
import { claimRecipientForSending, claimScheduledCampaignForSending } from "@/lib/campaign-send-repository";
import { scheduleCampaign, cancelScheduledCampaign } from "@/lib/campaign-schedule-service";
import { processWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-service";
import { normalizePhone } from "@/lib/phone";

const runId = randomUUID();
const passed = new Set<string>();
const pass = (...labels: string[]) => { labels.forEach((label) => passed.add(label)); console.log(`PASS ${labels.join(", ")}`); };
const ids: string[] = [];
const envNames = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID", "WHATSAPP_API_VERSION", "MESSAGE_PROVIDER"];
const oldEnv = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
const realFetch = globalThis.fetch;
const phoneNumberId = `${Date.now()}21`;
const wabaId = `${Date.now()}22`;
const token = `qa-in-memory-${runId}`;
const templates: MetaTemplate[] = [
  { id: "qa_plain", name: "qa_plain", language: "es_AR", category: "MARKETING", status: "APPROVED", components: [{ type: "HEADER", format: "TEXT", text: "Oferta" }, { type: "BODY", text: "Una novedad" }, { type: "FOOTER", text: "Billetera" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://example.com" }] }] },
  { id: "qa_one", name: "qa_one", language: "es_AR", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Hola {{1}}" }] },
  { id: "qa_many", name: "qa_many", language: "es_AR", category: "MARKETING", status: "APPROVED", components: [{ type: "BODY", text: "Hola {{1}}, {{2}}, {{3}}, {{4}}, {{5}}" }] },
  { id: "qa_rejected", name: "qa_rejected", language: "es_AR", category: "MARKETING", status: "REJECTED", components: [{ type: "BODY", text: "No" }] },
  { id: "qa_image", name: "qa_image", language: "es_AR", category: "MARKETING", status: "APPROVED", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Imagen" }] },
];
type Payload = { to: string; type: string; text?: unknown; template: { name: string; language: { code: string }; components?: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> }; biz_opaque_callback_data: string };
const posts: Payload[] = [];
let gets = 0, behavior: "success" | "reject" | "reject-once" | "network" | "early-read" = "success";
const wamidFor = (n: number) => `wamid.qa.meta-campaign.${runId}.${n}`;
const waIdFor = (to: string) => /^54\d{10}$/.test(to) ? `549${to.slice(2)}` : to;
function statusPayload(wamid: string, waId: string, status: string, clientRequestId?: string) {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: wamid, recipient_id: waId, status,
      timestamp: String(Math.floor(Date.now() / 1000)), ...(clientRequestId ? { biz_opaque_callback_data: clientRequestId } : {}),
      ...(status === "failed" ? { errors: [{ code: 131026, title: "Undeliverable", message: "No se pudo entregar" }] } : {}),
    }],
  } }] }] };
}
function inboundPayload(waId: string) {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneNumberId }, contacts: [{ wa_id: waId }], messages: [{ id: `wamid.qa.inbound.${runId}`, from: waId,
      timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "QA inbound" } }],
  } }] }] };
}
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, "graph.facebook.com", "Unexpected external request blocked");
  if (url.pathname === `/v23.0/${wabaId}/message_templates` && (!init?.method || init.method === "GET")) {
    gets++; assert.ok(url.searchParams.get("fields")?.includes("components"));
    const name = url.searchParams.get("name");
    return Response.json({ data: name ? templates.filter((template) => template.name === name) : templates });
  }
  assert.equal(url.pathname, `/v23.0/${phoneNumberId}/messages`); assert.equal(init?.method, "POST");
  const payload = JSON.parse(String(init?.body)) as Payload;
  assert.equal(payload.type, "template"); assert.equal(payload.text, undefined);
  posts.push(payload);
  if (behavior === "network") throw new Error("Simulated network ambiguity");
  if (behavior === "reject" || behavior === "reject-once") {
    if (behavior === "reject-once") behavior = "success";
    return Response.json({ error: { code: 131030, error_subcode: 123, message: `Bearer ${token} rejected` } }, { status: 400 });
  }
  const wamid = wamidFor(posts.length), waId = waIdFor(payload.to);
  if (behavior === "early-read") await processWhatsAppWebhookPayload(statusPayload(wamid, waId, "read", payload.biz_opaque_callback_data));
  return Response.json({ contacts: [{ wa_id: waId }], messages: [{ id: wamid }] });
};

async function context(workspace: Workspace, role: WorkspaceRole = "OWNER", scope: GroupScopeMode = "ALL"): Promise<AuthorizationContext> {
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: `qa-meta-${randomUUID()}`, role, groupScopeMode: scope } });
  return { userId: member.userId, memberId: member.id, workspaceId: workspace.id, workspace, role, groupScopeMode: scope, permissions: getEffectivePermissions(role, []) } as AuthorizationContext;
}
async function run() {
  assert.equal(campaignDeliveryMode(undefined), "MOCK"); assert.throws(() => campaignDeliveryMode("INVALID"));
  process.env.WHATSAPP_ACCESS_TOKEN = token; process.env.WHATSAPP_PHONE_NUMBER_ID = phoneNumberId;
  process.env.WHATSAPP_WABA_ID = wabaId; process.env.WHATSAPP_API_VERSION = "v23.0"; process.env.MESSAGE_PROVIDER = "mock";
  try {
    const workspace = await prisma.workspace.create({ data: { name: `QA Meta campaigns ${runId}` } }); ids.push(workspace.id);
    const foreign = await prisma.workspace.create({ data: { name: `QA Meta foreign ${runId}` } }); ids.push(foreign.id);
    for (const id of ids) await prisma.workspaceModule.createMany({ data: [{ workspaceId: id, key: "CAMPAIGNS", enabled: true }, { workspaceId: id, key: "INBOX", enabled: true }] });
    const owner = await context(workspace), other = await context(foreign);
    const connection = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, phoneNumberId, wabaId } });
    const clients = await Promise.all([0, 1, 2].map((index) => {
      const phone = `54911${Date.now().toString().slice(-7)}${index}`;
      return prisma.client.create({ data: { workspaceId: workspace.id, name: `Juan ${index}`, phone, phoneNormalized: phone, company: "Empresa QA", email: `qa${index}@example.com`, optIn: index !== 2 } });
    }));
    const selection = (name = "qa_one", mapping: ParameterMapping = { "1": { source: "name" } }) => ({ connectionId: connection.id, templateName: name, language: "es_AR", mapping });
    const draft = (name = "qa_one", mapping?: ParameterMapping, selected = [clients[0].id]) => createManualCampaign(owner, { name: `QA ${runId}`, message: "NEVER SEND AS TEXT", deliveryMode: "META_WHATSAPP", template: selection(name, mapping) }, selected);
    const ready = async (name = "qa_one", mapping?: ParameterMapping, selected?: string[]) => { const campaign = await draft(name, mapping, selected); await markCampaignReady(owner, campaign.id); return campaign; };
    const storedRecipients = (campaignId: string) => prisma.campaignRecipient.findMany({ where: { campaignId }, include: { whatsAppMessage: true } });

    const legacy = await prisma.campaign.create({ data: { workspaceId: workspace.id, name: "QA existing", message: "QA" } });
    assert.equal(legacy.deliveryMode, "MOCK"); pass("A");
    const mock = await createManualCampaign(owner, { name: "QA Mock", message: "Hola {{nombre}}" }, [clients[0].id]);
    await markCampaignReady(owner, mock.id); const noMeta = posts.length;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    assert.equal((await sendCampaign(owner, mock.id)).accepted, 1); assert.equal(posts.length, noMeta);
    process.env.WHATSAPP_ACCESS_TOKEN = token; pass("B");
    await assert.rejects(createManualCampaign(other, { name: "QA", message: "QA", deliveryMode: "META_WHATSAPP", template: selection() }, [clients[0].id]));
    assert.equal((await getCampaignMetaAvailability(other)).available, false); pass("C", "D");
    const catalog = await getCampaignTemplateCatalog(owner, connection.id);
    assert.ok(gets > 0); assert.equal(catalog.length, templates.length); pass("E");
    assert.ok(catalog.every((template) => !("id" in template)), "Catalog UI has no technical Meta IDs");
    assert.equal(catalog.filter((template) => template.status === "APPROVED" && template.analysis.compatible).length, 3);
    assert.throws(() => requireApprovedTemplate(templates, "qa_rejected", "es_AR"));
    await assert.rejects(draft("qa_rejected", {})); pass("F", "G");
    assert.equal(analyzeTemplate(templates[4]).compatible, false);
    for (const component of [{ type: "HEADER", format: "VIDEO" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Go", url: "https://example.com/{{1}}" }] }, { type: "BUTTONS", buttons: [{ type: "FLOW", text: "Flow" }] }]) {
      assert.equal(analyzeTemplate({ category: "MARKETING", components: [{ type: "BODY", text: "Hola" }, component] }).compatible, false);
    }
    assert.equal(analyzeTemplate({ category: "AUTHENTICATION", components: [{ type: "BODY", text: "Code" }] }).compatible, false);
    assert.equal(analyzeTemplate({ category: "MARKETING", components: [{ type: "BODY", text: "Hola {{2}}" }] }).compatible, false);
    await assert.rejects(draft("qa_image", {})); pass("H");
    assert.deepEqual(analyzeTemplate(templates[0]).variables, []); const plain = await ready("qa_plain", {}); pass("I");
    assert.deepEqual(analyzeTemplate(templates[1]).variables, [1]); pass("J");
    assert.deepEqual(analyzeTemplate(templates[2]).variables, [1, 2, 3, 4, 5]); pass("K");
    const mapping: ParameterMapping = { "1": { source: "name" }, "2": { source: "company" }, "3": { source: "email" }, "4": { source: "phone" }, "5": { source: "static", value: "PROMO20" } };
    const expected = [clients[0].name, clients[0].company!, clients[0].email!, clients[0].phone, "PROMO20"];
    assert.deepEqual(resolveTemplateParameters(validateMapping(mapping, [1, 2, 3, 4, 5]), [1, 2, 3, 4, 5], clients[0]), expected); pass("L", "M", "N", "O", "P");
    assert.throws(() => validateMapping({}, [1])); await assert.rejects(draft("qa_one", {}));
    const missing = await draft("qa_one", { "1": { source: "email" } }, [clients[1].id]);
    await prisma.client.update({ where: { id: clients[1].id }, data: { email: null } });
    await assert.rejects(markCampaignReady(owner, missing.id));
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: missing.id } })).status, "DRAFT");
    assert.equal((await storedRecipients(missing.id))[0].templateParameters, null);
    await prisma.client.update({ where: { id: clients[1].id }, data: { email: clients[1].email } }); pass("Q");
    const frozen = await ready("qa_many", mapping, clients.map((client) => client.id));
    assert.equal((await storedRecipients(frozen.id)).length, 2, "No opt-in is excluded");
    assert.deepEqual((await storedRecipients(frozen.id)).find((recipient) => recipient.clientId === clients[0].id)?.templateParameters, expected); pass("R");
    await prisma.client.update({ where: { id: clients[0].id }, data: { name: "Pedro", company: "Changed", email: "changed@example.com", optIn: false } });
    assert.deepEqual((await storedRecipients(frozen.id)).find((recipient) => recipient.clientId === clients[0].id)?.templateParameters, expected); pass("S");
    await assert.rejects(updateCampaignTemplateDraft(owner, frozen.id, selection())); pass("T");
    const conversation = await prisma.conversation.create({ data: { workspaceId: workspace.id, whatsappConnectionId: connection.id, externalParticipantId: clients[0].phone, clientId: clients[0].id, lastMessageAt: new Date(0), lastInboundAt: new Date(0) } });
    await prisma.conversationReadState.create({ data: { conversationId: conversation.id, memberId: owner.memberId, lastReadAt: new Date() } });
    const beforeConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    const beforePosts = posts.length, beforeGets = gets;
    const result = await sendCampaign(owner, frozen.id);
    assert.equal(result.accepted, 2); assert.equal(posts.length - beforePosts, 2); assert.equal(gets - beforeGets, 1);
    assert.ok(posts.slice(beforePosts).every((payload) => payload.type === "template" && payload.text === undefined)); pass("U");
    const payload = posts[beforePosts];
    assert.equal(payload.template.name, "qa_many"); assert.equal(payload.template.language.code, "es_AR");
    assert.deepEqual(payload.template.components?.[0].parameters.map((parameter) => parameter.text), expected);
    assert.ok(payload.biz_opaque_callback_data); pass("V");
    assert.equal(payload.to, `54${clients[0].phone.slice(3)}`); assert.equal(normalizePhone(clients[0].phone), clients[0].phone); pass("W");
    const recipients = await storedRecipients(frozen.id);
    const recipient = recipients.find((row) => row.clientId === clients[0].id)!;
    assert.ok(recipient.providerMessageId?.startsWith("wamid.qa.")); pass("X");
    assert.ok(recipients.every((row) => row.status === "ACCEPTED")); pass("Y");
    assert.ok(recipients.every((row) => row.whatsAppMessage?.direction === "OUTBOUND" && row.whatsAppMessage.type === "TEMPLATE")); pass("Z");
    assert.ok(recipients.every((row) => row.whatsAppMessage?.campaignRecipientId === row.id && row.whatsAppMessage.providerMessageId === row.providerMessageId)); pass("AA");
    assert.equal(recipient.whatsAppMessage?.conversationId, conversation.id);
    const afterConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    assert.equal(afterConversation.externalParticipantId, beforeConversation.externalParticipantId);
    assert.deepEqual(afterConversation.lastMessageAt, beforeConversation.lastMessageAt); assert.deepEqual(afterConversation.lastInboundAt, beforeConversation.lastInboundAt); assert.ok(afterConversation.lastOutboundAt); pass("AB");
    const second = recipients.find((row) => row.clientId === clients[1].id)!;
    assert.equal(second.whatsAppMessage?.conversationId, null); assert.equal(await prisma.conversation.count({ where: { workspaceId: workspace.id } }), 1); pass("AC");
    await processWhatsAppWebhookPayload(inboundPayload(clients[1].phone));
    assert.ok((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { campaignRecipientId: second.id } })).conversationId);
    assert.equal(await prisma.conversation.count({ where: { workspaceId: workspace.id, externalParticipantId: clients[1].phone } }), 1); pass("AD");
    const status = (value: string) => processWhatsAppWebhookPayload(statusPayload(recipient.providerMessageId!, clients[0].phone, value));
    const sentPayload = statusPayload(recipient.providerMessageId!, clients[0].phone, "sent");
    await processWhatsAppWebhookPayload(sentPayload); const duplicate = await processWhatsAppWebhookPayload(sentPayload); assert.equal(duplicate[0].duplicate, true);
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: recipient.providerMessageId } }), 1); pass("AE");
    await status("delivered"); assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, "DELIVERED"); pass("AF");
    await status("read"); assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, "READ"); pass("AG");
    await status("delivered"); await status("failed"); assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, "READ"); pass("AI");
    await processWhatsAppWebhookPayload(statusPayload(second.providerMessageId!, clients[1].phone, "failed"));
    assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: second.id } })).status, "FAILED"); pass("AH");
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: frozen.id } })).status, "COMPLETED");
    assert.equal((await getCampaignDetails(owner, frozen.id))?.deliverySummary.accepted, 2); pass("AJ");
    const afterPosts = posts.length;
    await assert.rejects(sendCampaign(owner, frozen.id)); await processClaimedCampaign({ workspaceId: workspace.id }, frozen.id);
    assert.equal(posts.length, afterPosts); pass("AK", "AN");
    await prisma.client.update({ where: { id: clients[0].id }, data: { optIn: true } });
    const rejection = await ready(); behavior = "reject";
    await sendCampaign(owner, rejection.id); const rejected = (await storedRecipients(rejection.id))[0];
    assert.equal(rejected.status, "FAILED"); assert.equal(rejected.failureCode, "131030"); assert.ok(!rejected.errorMessage?.includes(token));
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: rejection.id } })).status, "FAILED"); pass("AL");
    const partial = await ready("qa_one", undefined, [clients[0].id, clients[1].id]); behavior = "reject-once";
    const partialResult = await sendCampaign(owner, partial.id);
    assert.equal(partialResult.accepted, 1); assert.equal(partialResult.failed, 1);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: partial.id } })).status, "PARTIAL");
    const ambiguous = await ready(); behavior = "network";
    const beforeNetwork = posts.length; await sendCampaign(owner, ambiguous.id);
    assert.equal((await storedRecipients(ambiguous.id))[0].status, "UNKNOWN");
    await processClaimedCampaign({ workspaceId: workspace.id }, ambiguous.id);
    assert.equal(posts.length, beforeNetwork + 1); pass("AM");
    behavior = "success"; const concurrent = await ready(); const concurrentStart = posts.length;
    const claims = await Promise.allSettled(Array.from({ length: 20 }, () => sendCampaign(owner, concurrent.id)));
    assert.equal(claims.filter((claim) => claim.status === "fulfilled").length, 1);
    assert.equal(posts.length, concurrentStart + 1); pass("AO");
    // Early read webhook races the HTTP result but must bind the same intent and never regress.
    const early = await ready(); behavior = "early-read"; await sendCampaign(owner, early.id); behavior = "success";
    const earlyRecipient = (await storedRecipients(early.id))[0]; assert.equal(earlyRecipient.status, "READ");
    assert.ok(earlyRecipient.sentAt); assert.ok(earlyRecipient.readAt); assert.equal(earlyRecipient.whatsAppMessage?.status, "READ");
    assert.equal(await prisma.whatsAppMessage.count({ where: { campaignRecipientId: earlyRecipient.id } }), 1);
    // Interrupted processing is never reset/retransmitted on a Workflow retry.
    const interrupted = await ready(); await prisma.campaign.update({ where: { id: interrupted.id }, data: { status: "SENDING" } });
    const interruptedRecipient = (await storedRecipients(interrupted.id))[0];
    await claimRecipientForSending({ workspaceId: workspace.id }, interrupted.id, interruptedRecipient.id);
    const beforeRetry = posts.length; await processClaimedCampaign({ workspaceId: workspace.id }, interrupted.id);
    assert.equal(posts.length, beforeRetry); assert.equal((await storedRecipients(interrupted.id))[0].status, "PROCESSING");
    const scheduled = await ready();
    const schedule = (id: string) => scheduleCampaign(owner, id, { scheduledAt: new Date(Date.now() + 120_000).toISOString(), timezone: "America/Buenos_Aires" }, { startWorkflow: async () => "qa-in-memory" });
    const wake = async (input: Awaited<ReturnType<typeof schedule>>) => {
      const claimed = await claimScheduledCampaignForSending({ ...input, scheduledAt: new Date(input.scheduledAt) });
      if (claimed) await processClaimedCampaign({ workspaceId: workspace.id }, input.campaignId);
      return claimed;
    };
    const input = await schedule(scheduled.id); assert.equal(await wake(input), true);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: scheduled.id } })).status, "COMPLETED");
    assert.equal(await wake(input), false); pass("AP");
    const unavailable = await ready(); const unavailableInput = await schedule(unavailable.id);
    const unavailableStart = posts.length; templates[1].status = "PAUSED";
    assert.equal(await wake(unavailableInput), true); assert.equal(posts.length, unavailableStart);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: unavailable.id } })).status, "FAILED");
    templates[1].status = "APPROVED"; pass("AQ");
    const cancelled = await ready(); const cancelledInput = await schedule(cancelled.id);
    await cancelScheduledCampaign(owner, cancelled.id); assert.equal(await wake(cancelledInput), false); pass("AR");
    const rescheduled = await ready(); const firstInput = await schedule(rescheduled.id);
    const beforeSnapshot = (await storedRecipients(rescheduled.id))[0].templateParameters;
    const secondInput = await schedule(rescheduled.id); assert.notEqual(firstInput.scheduleGeneration, secondInput.scheduleGeneration);
    assert.equal(await wake(firstInput), false); assert.deepEqual((await storedRecipients(rescheduled.id))[0].templateParameters, beforeSnapshot);
    assert.equal(await wake(secondInput), true); pass("AS");
    const permissionCampaign = await ready(); const viewer = await context(workspace, "VIEWER");
    await assert.rejects(sendCampaign(viewer, permissionCampaign.id)); await assert.rejects(sendCampaign(other, permissionCampaign.id));
    const agent = await context(workspace, "AGENT");
    await assert.rejects(sendCampaign({ ...agent, permissions: new Set([...agent.permissions].filter((permission) => permission !== "CAMPAIGN_SEND")) }, permissionCampaign.id));
    const scoped = await context(workspace, "ADMIN", "SELECTED"); await assert.rejects(sendCampaign(scoped, permissionCampaign.id));
    assert.equal(await getCampaignDetails(other, permissionCampaign.id), null); pass("AT");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "CAMPAIGNS" } }, data: { enabled: false } });
    await assert.rejects(sendCampaign(owner, permissionCampaign.id)); await assert.rejects(draft()); pass("AU");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "CAMPAIGNS" } }, data: { enabled: true } });
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: false } });
    await sendCampaign(owner, permissionCampaign.id); assert.equal((await storedRecipients(permissionCampaign.id))[0].status, "ACCEPTED"); pass("AV");
    const mismatch = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, phoneNumberId: `${phoneNumberId}9`, wabaId } });
    await assert.rejects(getCampaignMetaConnection(workspace.id, mismatch.id));
    const disabledCampaign = await ready(); await prisma.whatsAppConnection.update({ where: { id: connection.id }, data: { status: "DISABLED" } });
    const disabledStart = posts.length; await sendCampaign(owner, disabledCampaign.id); assert.equal(posts.length, disabledStart);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: disabledCampaign.id } })).status, "FAILED");
    await prisma.whatsAppConnection.update({ where: { id: connection.id }, data: { status: "ACTIVE" } }); pass("AW");
    const metadata = await prisma.activity.findMany({ where: { workspaceId: workspace.id }, select: { metadata: true } });
    const outboundErrors = await prisma.whatsAppMessage.findMany({ where: { workspaceId: workspace.id }, select: { failureMessage: true } });
    assert.ok(!JSON.stringify([metadata, outboundErrors]).includes(token)); pass("AX");
    await sendCampaign(owner, plain.id); assert.equal(posts.at(-1)?.template.components, undefined);
    const changedTemplate = await ready("qa_plain", {}); const beforeChanged = posts.length;
    const buttons = templates[0].components[3] as { buttons: Array<{ url: string }> };
    buttons.buttons[0].url = "https://example.org";
    await sendCampaign(owner, changedTemplate.id);
    assert.equal(posts.length, beforeChanged); assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: changedTemplate.id } })).status, "FAILED");
    buttons.buttons[0].url = "https://example.com";
    const deletedConnectionCampaign = await ready(); const beforeDeleted = posts.length;
    await prisma.whatsAppConnection.delete({ where: { id: connection.id } });
    await sendCampaign(owner, deletedConnectionCampaign.id); assert.equal(posts.length, beforeDeleted);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: deletedConnectionCampaign.id } })).status, "FAILED");
    const expectedLabels = "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC AD AE AF AG AH AI AJ AK AL AM AN AO AP AQ AR AS AT AU AV AW AX".split(" ");
    assert.deepEqual(expectedLabels.filter((label) => !passed.has(label)), []);
    console.log(`A–AX: ${passed.size}/${expectedLabels.length} OK. Additional: early webhook race, interrupted PROCESSING, no-variable payload, opt-in snapshot, PARTIAL, template change, deleted connection.`);
  } finally {
    await prisma.whatsAppWebhookEvent.deleteMany({ where: { workspaceId: { in: ids } } });
    await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
    const where = { workspaceId: { in: ids } };
    const remaining = await Promise.all([prisma.client.count({ where }), prisma.campaign.count({ where }),
      prisma.conversation.count({ where }), prisma.whatsAppMessage.count({ where }), prisma.whatsAppWebhookEvent.count({ where }), prisma.activity.count({ where })]);
    assert.ok(remaining.every((count) => count === 0));
    assert.equal(await prisma.workspace.count({ where: { id: { in: ids } } }), 0);
    for (const key of envNames) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; }
    globalThis.fetch = realFetch;
    console.log("QA cleanup: zero temporary workspaces, contacts, campaigns, conversations, messages, webhooks or Activity.");
  }
}
run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.replaceAll(token, "[REDACTED]").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DB URL]") : "Unknown error";
  console.error(`Meta campaign QA failed: ${message.slice(0, 1200)}`); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
