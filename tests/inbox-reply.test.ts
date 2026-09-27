import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GroupScopeMode, WorkspacePermission, WorkspaceRole, type Workspace } from "@prisma/client";

import type { AuthorizationContext } from "@/lib/authorization";
import { messageStatusLabel } from "@/lib/conversation-presentation";
import { MetaCampaignTemplateRequiredError, MetaWhatsAppProvider } from "@/lib/messaging/meta-whatsapp-provider";
import { MockMessageProvider } from "@/lib/messaging/mock-message-provider";
import { normalizePhone } from "@/lib/phone";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { PERMISSION_GROUPS } from "@/lib/team-labels";
import { prisma } from "@/lib/prisma";
import { WhatsAppApiError, WhatsAppCloudApiClient } from "@/lib/whatsapp/client";
import { sendConversationReply } from "@/lib/whatsapp/conversation-send-service";
import { getWhatsAppConfiguration } from "@/lib/whatsapp/config";
import { formatPhoneForWhatsApp, formatWhatsAppRecipientForSend } from "@/lib/whatsapp/phone";
import { getWhatsAppServiceWindow } from "@/lib/whatsapp/service-window";
import { processWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-service";

const runId = randomUUID();
const passed = new Set<string>();
const recipientPassed = new Set<string>();
const pass = (...labels: string[]) => labels.forEach((label) => passed.add(label));
const passRecipient = (...labels: string[]) => labels.forEach((label) => recipientPassed.add(label));
const deny = (promise: Promise<unknown>) => assert.rejects(promise);
const request = (conversationId: string, body = "Hola desde QA", clientRequestId = randomUUID()) => ({ conversationId, body, clientRequestId });

async function context(workspace: Workspace, role: WorkspaceRole, scope: GroupScopeMode, suffix: string): Promise<AuthorizationContext> {
  const member = await prisma.workspaceMember.create({ data: {
    workspaceId: workspace.id, userId: `qa-inbox-reply-${suffix}-${runId}`, role, groupScopeMode: scope,
  } });
  return { userId: member.userId, memberId: member.id, workspaceId: workspace.id,
    workspace, role, groupScopeMode: scope, permissions: getEffectivePermissions(role, []),
  } as AuthorizationContext;
}

function statusPayload(phoneNumberId: string, wabaId: string, wamid: string, waId: string, status: string, clientRequestId: string) {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneNumberId },
    statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: waId,
      biz_opaque_callback_data: clientRequestId }],
  } }] }] };
}

function inboundPayload(phoneNumberId: string, wabaId: string, wamid: string, waId: string) {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: waId }],
    messages: [{ id: wamid, from: waId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "QA inbound" } }],
  } }] }] };
}

async function testRecipientFormatting() {
  const waId = "5491123456789";
  const outbound = "541123456789";
  assert.equal(formatWhatsAppRecipientForSend(waId), outbound); passRecipient("A");
  assert.equal(formatPhoneForWhatsApp(waId, "conversation"), outbound);
  const technicalRecipient = process.env.WHATSAPP_TEST_RECIPIENT?.trim();
  if (technicalRecipient && /^54\d{10}$/.test(technicalRecipient)) {
    assert.equal(formatWhatsAppRecipientForSend(`549${technicalRecipient.slice(2)}`), technicalRecipient);
  }
  passRecipient("B");
  assert.equal(formatWhatsAppRecipientForSend("551123456789"), "551123456789"); passRecipient("D");
  assert.equal(formatWhatsAppRecipientForSend("549123"), "549123"); passRecipient("E");
  assert.equal(formatPhoneForWhatsApp(waId, "meta-explicit"), waId);
  assert.equal(formatPhoneForWhatsApp(outbound, "meta-explicit"), outbound); passRecipient("F");
  assert.equal(normalizePhone("+54 9 11 2345-6789"), waId); passRecipient("G");
  const mock = new MockMessageProvider();
  assert.ok((await mock.sendMessage({ phone: outbound, message: "QA", recipientName: "QA" })).providerMessageId.startsWith("mock_"));
  passRecipient("K");
  let technicalTo = "";
  const fakeFetch: typeof fetch = async (_url, init) => {
    technicalTo = String(JSON.parse(String(init?.body)).to);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.qa.technical" }] }), { status: 200 });
  };
  const provider = new MetaWhatsAppProvider(new WhatsAppCloudApiClient({ accessToken: "qa-only", phoneNumberId: "123", wabaId: "456", apiVersion: "v23.0" }, fakeFetch));
  await provider.sendTemplateMessage({ phone: outbound, recipientFormat: "meta-explicit", templateName: "hello_world", languageCode: "en_US" });
  assert.equal(technicalTo, outbound); passRecipient("L");
}

async function run() {
  await testRecipientFormatting();
  const oldEnv = Object.fromEntries(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID", "WHATSAPP_API_VERSION"].map((name) => [name, process.env[name]]));
  const workspace = await prisma.workspace.create({ data: { name: `QA Inbox Reply ${runId}` } });
  const foreign = await prisma.workspace.create({ data: { name: `QA Inbox Reply Foreign ${runId}` } });
  const phoneNumberId = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const wabaId = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const waId = `54${Date.now().toString().slice(-10)}`;
  process.env.WHATSAPP_ACCESS_TOKEN = `qa-memory-only-${runId}`;
  process.env.WHATSAPP_PHONE_NUMBER_ID = phoneNumberId;
  process.env.WHATSAPP_WABA_ID = wabaId;
  process.env.WHATSAPP_API_VERSION = "v23.0";
  try {
    await prisma.workspaceModule.create({ data: { workspaceId: workspace.id, key: "INBOX", enabled: true } });
    await prisma.workspaceModule.create({ data: { workspaceId: foreign.id, key: "INBOX", enabled: true } });
    const connection = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, phoneNumberId, wabaId } });
    const otherConnection = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, phoneNumberId: `${phoneNumberId}1`, wabaId } });
    const owner = await context(workspace, WorkspaceRole.OWNER, GroupScopeMode.ALL, "owner");
    const admin = await context(workspace, WorkspaceRole.ADMIN, GroupScopeMode.ALL, "admin");
    const agent = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.ALL, "agent");
    const viewer = await context(workspace, WorkspaceRole.VIEWER, GroupScopeMode.ALL, "viewer");
    const selected = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.SELECTED, "selected");
    const foreignOwner = await context(foreign, WorkspaceRole.OWNER, GroupScopeMode.ALL, "foreign");
    const group = await prisma.group.create({ data: { workspaceId: workspace.id, name: "QA allowed" } });
    await prisma.memberGroupAccess.create({ data: { memberId: selected.memberId, groupId: group.id } });
    const client = await prisma.client.create({ data: { workspaceId: workspace.id, name: "QA Client", phone: waId, phoneNormalized: waId,
      clientGroups: { create: { groupId: group.id } } } });
    const now = new Date();
    const conversation = await prisma.conversation.create({ data: {
      workspaceId: workspace.id, whatsappConnectionId: connection.id, externalParticipantId: waId,
      clientId: client.id, lastMessageAt: now, lastInboundAt: now,
    } });
    const unknown = await prisma.conversation.create({ data: {
      workspaceId: workspace.id, whatsappConnectionId: connection.id, externalParticipantId: `${waId}1`,
      lastMessageAt: now, lastInboundAt: now,
    } });
    const wrongConnection = await prisma.conversation.create({ data: {
      workspaceId: workspace.id, whatsappConnectionId: otherConnection.id, externalParticipantId: `${waId}2`,
      lastMessageAt: now, lastInboundAt: now,
    } });
    let calls = 0;
    let lastTo = "";
    let lastBody = "";
    const sender = { sendTextMessage: async (input: { phone: string; text: string }) => {
      calls++; lastTo = input.phone; lastBody = input.text;
      return { providerMessageId: `wamid.qa.${runId}.${calls}`, acceptedAt: new Date(), httpStatus: 200, to: input.phone };
    } };
    const send = (ctx: AuthorizationContext, input = request(conversation.id), fake = sender) => sendConversationReply(ctx, input, { sender: fake });

    assert.ok(owner.permissions.has(WorkspacePermission.INBOX_REPLY)); await send(owner); pass("A");
    assert.ok(admin.permissions.has(WorkspacePermission.INBOX_REPLY)); await send(admin); pass("B");
    assert.ok(agent.permissions.has(WorkspacePermission.INBOX_REPLY)); await send(agent); pass("C");
    await deny(send(viewer)); pass("D");
    await deny(send({ ...agent, permissions: getEffectivePermissions(WorkspaceRole.AGENT, [{ permission: WorkspacePermission.INBOX_REPLY, allowed: false }]) }));
    assert.ok(PERMISSION_GROUPS.some((group) => group.permissions.some(([permission]) => permission === WorkspacePermission.INBOX_REPLY)));
    pass("E");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: false } });
    await deny(send(owner)); pass("F");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: true } });
    await deny(send(selected, request(unknown.id))); pass("G", "AJ");
    await deny(send(foreignOwner)); pass("H");
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "ARCHIVED" } });
    await deny(send(owner)); pass("I");
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "OPEN" } });
    assert.equal(getWhatsAppServiceWindow(new Date(now.getTime() - 23 * 3600_000), now).open, true); pass("J");
    assert.equal(getWhatsAppServiceWindow(new Date(now.getTime() - 24 * 3600_000), now).open, false); pass("K");
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: null } });
    await deny(send(owner)); pass("L");
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: now } });
    await send(owner); pass("M");
    await deny(send(owner, request(conversation.id, "   "))); pass("N");
    await deny(send(owner, request(conversation.id, "x".repeat(4097)))); pass("O");
    assert.equal(lastTo, waId); pass("P");
    const actionSource = await readFile(path.join(process.cwd(), "src/app/bandeja/actions.ts"), "utf8");
    assert.ok(actionSource.includes("sendConversationReply(await getAuthorizationContext(), { conversationId: id, body, clientRequestId })")); pass("Q");
    await deny(send(owner, request(wrongConnection.id))); pass("R");
    const mainReq = request(conversation.id, "  Respuesta de prueba  ");
    const beforeActivity = await prisma.activity.count({ where: { workspaceId: workspace.id } });
    const main = await send(owner, mainReq);
    const stored = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: main.messageId } });
    assert.equal(stored.direction, "OUTBOUND"); assert.equal(stored.type, "TEXT"); assert.equal(stored.textBody, "Respuesta de prueba"); pass("S");
    assert.equal(stored.sentByMemberId, owner.memberId); assert.equal(stored.sentByUserId, owner.userId); pass("T");
    assert.ok(stored.providerMessageId?.startsWith("wamid.qa.")); assert.equal(stored.status, "ACCEPTED"); pass("U");
    assert.equal(lastBody, "Respuesta de prueba");
    const wamid = stored.providerMessageId!;
    const sendStatus = async (status: string) => processWhatsAppWebhookPayload(statusPayload(phoneNumberId, wabaId, wamid, waId, status, mainReq.clientRequestId));
    await sendStatus("sent"); assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: main.messageId } })).status, "SENT"); pass("V");
    await sendStatus("delivered"); assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: main.messageId } })).status, "DELIVERED"); pass("W");
    await sendStatus("read"); assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: main.messageId } })).status, "READ"); pass("X");
    await sendStatus("delivered"); assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: main.messageId } })).status, "READ");
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: wamid } }), 1); pass("Y");
    const beforeRepeated = calls; const repeated = await send(owner, mainReq); assert.equal(repeated.messageId, main.messageId); assert.equal(calls, beforeRepeated); pass("Z");
    const concurrentReq = request(conversation.id);
    const concurrent = await Promise.all([send(owner, concurrentReq), send(owner, concurrentReq)]);
    assert.equal(concurrent[0].messageId, concurrent[1].messageId); assert.equal(calls, beforeRepeated + 1); pass("AA");
    const raceReq = request(conversation.id);
    const raceWamid = `wamid.qa.race.${runId}`;
    const race = await send(owner, raceReq, { sendTextMessage: async (input: { phone: string }) => {
      await processWhatsAppWebhookPayload(statusPayload(phoneNumberId, wabaId, raceWamid, input.phone, "sent", raceReq.clientRequestId));
      return { providerMessageId: raceWamid, acceptedAt: new Date(), httpStatus: 200, to: input.phone };
    } });
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: race.messageId } })).status, "SENT");
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: raceWamid } }), 1);
    const failedReq = request(conversation.id);
    const failure = await send(owner, failedReq, { sendTextMessage: async () => { throw new WhatsAppApiError(`token=${process.env.WHATSAPP_ACCESS_TOKEN}`, { httpStatus: 400, metaCode: 131000 }); } });
    const failed = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: failure.messageId } });
    assert.equal(failed.status, "FAILED"); assert.equal(failed.failureCode, "131000"); pass("AB");
    assert.ok(!failed.failureMessage?.includes(process.env.WHATSAPP_ACCESS_TOKEN!)); pass("AC");
    const ambiguousReq = request(conversation.id);
    const ambiguous = await send(owner, ambiguousReq, { sendTextMessage: async () => { throw new WhatsAppApiError("timeout", { httpStatus: 0 }); } });
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: ambiguous.messageId } })).status, "UNKNOWN");
    await send(owner, ambiguousReq); assert.equal(calls, beforeRepeated + 1); pass("AD");
    const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    assert.ok(updatedConversation.lastMessageAt >= now); pass("AE");
    assert.ok(updatedConversation.lastOutboundAt && updatedConversation.lastOutboundAt >= now); pass("AF");
    assert.equal(await prisma.conversationReadState.count({ where: { conversationId: conversation.id } }), 0); pass("AG");
    for (const key of ["PROCESSING", "ACCEPTED", "SENT", "DELIVERED", "READ", "FAILED"]) assert.notEqual(messageStatusLabel(key), "Estado desconocido");
    assert.equal(messageStatusLabel("UNKNOWN"), "Estado desconocido"); pass("AH");
    const detailSource = await readFile(path.join(process.cwd(), "src/app/bandeja/[conversationId]/page.tsx"), "utf8");
    assert.ok(detailSource.includes("Enviado por") && detailSource.includes("sentByUserId")); pass("AI");
    const contactless = await send(owner, request(unknown.id)); assert.ok(contactless.messageId); pass("AK");
    const argentineWaId = "5491123456789";
    const inboundId = `wamid.qa.inbound.${runId}`;
    await processWhatsAppWebhookPayload(inboundPayload(phoneNumberId, wabaId, inboundId, argentineWaId));
    const inboundMessage = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: inboundId } });
    const argentineConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: inboundMessage.conversationId! } });
    assert.equal(argentineConversation.externalParticipantId, argentineWaId); passRecipient("H");
    await processWhatsAppWebhookPayload(inboundPayload(phoneNumberId, wabaId, `wamid.qa.inbound-repeat.${runId}`, argentineWaId));
    assert.equal(await prisma.conversation.count({ where: { workspaceId: workspace.id, whatsappConnectionId: connection.id, externalParticipantId: argentineWaId } }), 1);
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: `wamid.qa.inbound-repeat.${runId}` } })).conversationId, argentineConversation.id);
    passRecipient("I");
    let replyTo = "";
    const replyFetch: typeof fetch = async (_url, init) => {
      replyTo = String(JSON.parse(String(init?.body)).to);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.qa.reply.${runId}` }] }), { status: 200 });
    };
    const replyProvider = new MetaWhatsAppProvider(new WhatsAppCloudApiClient(getWhatsAppConfiguration(), replyFetch));
    const reply = await send(owner, request(argentineConversation.id), replyProvider);
    assert.equal(replyTo, "541123456789");
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: reply.messageId } })).waId, argentineWaId);
    passRecipient("J");
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: argentineConversation.id } })).externalParticipantId, argentineWaId);
    passRecipient("C");
    assert.equal(await prisma.activity.count({ where: { workspaceId: workspace.id } }), beforeActivity); pass("AL");
    const mock = new MockMessageProvider(); assert.ok((await mock.sendMessage({ phone: waId, message: "QA", recipientName: "QA" })).providerMessageId.startsWith("mock_")); pass("AM");
    await assert.rejects(new MetaWhatsAppProvider().sendMessage(), MetaCampaignTemplateRequiredError); pass("AN");
    // La respuesta sin contacto usa el wa_id de esa Conversation, no Client.phone.
    assert.equal(lastTo, `${waId}1`);
  } finally {
    await prisma.whatsAppWebhookEvent.deleteMany({ where: { wabaId } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, foreign.id] } } });
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  assert.equal(await prisma.workspace.count({ where: { id: { in: [workspace.id, foreign.id] } } }), 0);
  assert.equal(await prisma.whatsAppWebhookEvent.count({ where: { wabaId } }), 0);
  const labels = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."ABCDEFGHIJKLMN".split("").map((suffix) => `A${suffix}`)];
  assert.deepEqual([...passed].sort(), labels.sort());
  assert.deepEqual([...recipientPassed].sort(), "ABCDEFGHIJKL".split(""));
  console.log(`Inbox Reply QA: ${passed.size}/${labels.length} OK; temporary data cleaned`);
  console.log(`Conversation recipient QA: ${recipientPassed.size}/12 OK; temporary data cleaned`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
