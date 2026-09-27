import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GroupScopeMode, WorkspacePermission, WorkspaceRole, type Workspace } from "@prisma/client";

import { getEffectivePermissions } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import { processWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-service";
import {
  getConversationDetails, getRecentConversationsForContact, linkConversationContact,
  linkNewlyCreatedContact, listConversations, markConversationRead, requireInboxAccess,
  setConversationArchived,
} from "@/lib/conversation-repository";
import { conversationPreview, messageStatusLabel } from "@/lib/conversation-presentation";
import { createClient, DuplicatePhoneError } from "@/lib/client-repository";
import type { AuthorizationContext } from "@/lib/authorization";

const suffix = randomUUID();
const passed = new Set<string>();
function pass(...labels: string[]) { for (const label of labels) passed.add(label); }

function inbound(phoneNumberId: string, wabaId: string, wamid: string, from: string, timestamp: number, type = "text") {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId },
    contacts: [{ wa_id: from, profile: { name: "QA WhatsApp" } }],
    messages: [{ id: wamid, from, timestamp: String(timestamp), type, ...(type === "text" ? { text: { body: `QA ${wamid}` } } : {}) }],
  } }] }] };
}

function outbound(phoneNumberId: string, wabaId: string, wamid: string, waId: string, timestamp: number) {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId },
    statuses: [{ id: wamid, status: "sent", timestamp: String(timestamp), recipient_id: waId }],
  } }] }] };
}

async function context(workspace: Workspace, role: WorkspaceRole, scope: GroupScopeMode, label: string) {
  const member = await prisma.workspaceMember.create({ data: {
    workspaceId: workspace.id, userId: `qa-inbox-${label}-${suffix}`, role, groupScopeMode: scope,
  } });
  return { userId: member.userId, workspaceId: workspace.id, memberId: member.id,
    role, groupScopeMode: scope, workspace, permissions: getEffectivePermissions(role, []),
  } as AuthorizationContext;
}

async function expectDenied(promise: Promise<unknown>) {
  await assert.rejects(promise);
}

async function runDatabaseTests() {
  const workspace = await prisma.workspace.create({ data: { name: `QA Inbox A ${suffix}` } });
  const otherWorkspace = await prisma.workspace.create({ data: { name: `QA Inbox B ${suffix}` } });
  const wabaId = `qa-inbox-waba-${suffix}`;
  const phoneA = `qa-inbox-phone-a-${suffix}`;
  const phoneB = `qa-inbox-phone-b-${suffix}`;
  const digits = suffix.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
  const waKnown = `54${digits}`;
  const waUnknown = `55${digits}`;
  const now = Math.floor(Date.now() / 1000) - 1000;
  try {
    const owner = await context(workspace, WorkspaceRole.OWNER, GroupScopeMode.ALL, "owner");
    const agent = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.ALL, "agent");
    const viewer = await context(workspace, WorkspaceRole.VIEWER, GroupScopeMode.ALL, "viewer");
    const selected = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.SELECTED, "selected");
    const other = await context(otherWorkspace, WorkspaceRole.OWNER, GroupScopeMode.ALL, "other");
    await expectDenied(requireInboxAccess(owner)); pass("A");
    await prisma.workspaceModule.create({ data: { workspaceId: workspace.id, key: "INBOX", enabled: true } });
    await prisma.workspaceModule.create({ data: { workspaceId: otherWorkspace.id, key: "INBOX", enabled: true } });
    await expectDenied(requireInboxAccess({ ...viewer, permissions: new Set() })); pass("B");
    await requireInboxAccess(owner); pass("C");
    await requireInboxAccess(agent, WorkspacePermission.INBOX_MANAGE); pass("D");
    await requireInboxAccess(viewer); await expectDenied(requireInboxAccess(viewer, WorkspacePermission.INBOX_MANAGE)); pass("E");

    const connectionA = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, wabaId, phoneNumberId: phoneA } });
    const connectionB = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, wabaId, phoneNumberId: phoneB } });
    const group = await prisma.group.create({ data: { workspaceId: workspace.id, name: "QA allowed" } });
    const blockedGroup = await prisma.group.create({ data: { workspaceId: workspace.id, name: "QA blocked" } });
    await prisma.memberGroupAccess.create({ data: { memberId: selected.memberId, groupId: group.id } });
    const known = await prisma.client.create({ data: {
      workspaceId: workspace.id, name: "QA Searchable", phone: waKnown, phoneNormalized: waKnown,
      clientGroups: { create: { groupId: group.id } },
    } });
    const restrictedClient = await prisma.client.create({ data: {
      workspaceId: workspace.id, name: "QA Restricted", phone: `56${waKnown}`, phoneNormalized: `56${waKnown}`,
      clientGroups: { create: { groupId: blockedGroup.id } },
    } });
    const foreignClient = await prisma.client.create({ data: {
      workspaceId: otherWorkspace.id, name: "QA Foreign", phone: `57${waKnown}`, phoneNormalized: `57${waKnown}`,
    } });
    const knownFirst = `qa-inbox-known-1-${suffix}`;
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, knownFirst, waKnown, now));
    const first = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: knownFirst } });
    assert.ok(first.conversationId); pass("F");
    const knownSecond = `qa-inbox-known-2-${suffix}`;
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, knownSecond, waKnown, now + 10));
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: knownSecond } })).conversationId, first.conversationId); pass("G");
    const outboundId = `qa-inbox-out-${suffix}`;
    await processWhatsAppWebhookPayload(outbound(phoneA, wabaId, outboundId, waKnown, now + 20));
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: outboundId } })).conversationId, first.conversationId); pass("H");
    const secondConnectionId = `qa-inbox-other-connection-${suffix}`;
    await processWhatsAppWebhookPayload(inbound(phoneB, wabaId, secondConnectionId, waKnown, now + 30));
    const another = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: secondConnectionId } });
    assert.notEqual(another.conversationId, first.conversationId); pass("I");
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, knownFirst, waKnown, now));
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: knownFirst } }), 1);
    assert.equal(await prisma.conversation.count({ where: { workspaceId: workspace.id, whatsappConnectionId: connectionA.id, externalParticipantId: waKnown } }), 1); pass("J");
    const mainConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId! } });
    assert.equal(mainConversation.lastMessageAt.getTime(), (now + 20) * 1000); pass("K");
    assert.equal(mainConversation.lastInboundAt?.getTime(), (now + 10) * 1000); pass("L");
    assert.equal(mainConversation.lastOutboundAt?.getTime(), (now + 20) * 1000); pass("M");
    assert.equal(mainConversation.clientId, known.id); pass("N");

    const unknownId = `qa-inbox-unknown-${suffix}`;
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, unknownId, waUnknown, now + 40));
    const unknownMessage = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: unknownId } });
    const unknownConversationId = unknownMessage.conversationId!;
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: unknownConversationId } })).clientId, null); pass("O");
    assert.ok((await listConversations(owner, {})).items.some((item) => item.id === unknownConversationId)); pass("P");
    assert.ok(!(await listConversations(selected, {})).items.some((item) => item.id === unknownConversationId)); pass("Q");
    assert.ok((await listConversations(selected, {})).items.some((item) => item.id === mainConversation.id)); pass("R");
    const restrictedId = `qa-inbox-restricted-${suffix}`;
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, restrictedId, restrictedClient.phoneNormalized, now + 50));
    const restrictedConversation = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: restrictedId } });
    assert.ok(!(await listConversations(selected, {})).items.some((item) => item.id === restrictedConversation.conversationId)); pass("S");
    assert.equal(await getConversationDetails(selected, restrictedConversation.conversationId!), null); pass("T");
    assert.equal(await getConversationDetails(other, mainConversation.id), null); pass("U");
    await linkConversationContact(owner, unknownConversationId, known.id);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: unknownConversationId } })).clientId, known.id); pass("V");
    await expectDenied(linkConversationContact(selected, restrictedConversation.conversationId!, restrictedClient.id));
    await expectDenied(linkConversationContact(owner, unknownConversationId, foreignClient.id)); pass("W");
    const newlyCreated = await createClient(owner, { name: "QA New Inbox", phone: `58${waKnown}`, company: "", email: "", notes: "", optIn: false, groupIds: [] });
    await linkNewlyCreatedContact(owner, unknownConversationId, newlyCreated.id);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: unknownConversationId } })).clientId, newlyCreated.id); pass("X");
    await assert.rejects(createClient(owner, { name: "QA Duplicate", phone: newlyCreated.phone, company: "", email: "", notes: "", optIn: false, groupIds: [] }), DuplicatePhoneError); pass("Y");

    const readBefore = await listConversations(owner, { filter: "unread" });
    assert.ok(readBefore.items.some((item) => item.id === mainConversation.id)); pass("AA");
    await markConversationRead(owner, mainConversation.id);
    assert.ok(!(await listConversations(owner, { filter: "unread" })).items.some((item) => item.id === mainConversation.id)); pass("AC");
    assert.ok((await listConversations(agent, { filter: "unread" })).items.some((item) => item.id === mainConversation.id)); pass("Z", "AD");
    const readState = await prisma.conversationReadState.findUniqueOrThrow({ where: { conversationId_memberId: { conversationId: mainConversation.id, memberId: owner.memberId } } });
    assert.ok(readState.lastReadAt);
    const outboundOnlyId = `qa-inbox-out-only-${suffix}`;
    await processWhatsAppWebhookPayload(outbound(phoneA, wabaId, outboundOnlyId, `59${waKnown}`, now + 55));
    const outboundOnly = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: outboundOnlyId } });
    assert.ok(!(await listConversations(owner, { filter: "unread" })).items.some((item) => item.id === outboundOnly.conversationId)); pass("AB");
    await setConversationArchived(owner, mainConversation.id, true);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: mainConversation.id } })).status, "ARCHIVED"); pass("AE");
    await setConversationArchived(owner, mainConversation.id, false);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: mainConversation.id } })).status, "OPEN"); pass("AF");
    await setConversationArchived(owner, mainConversation.id, true);
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, `qa-inbox-reopen-${suffix}`, waKnown, now + 60));
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: mainConversation.id } })).status, "OPEN"); pass("AG");
    const actions = await prisma.activity.findMany({ where: { workspaceId: workspace.id, entityId: mainConversation.id } });
    assert.ok(actions.some((item) => item.action === "CONVERSATION_ARCHIVED"));
    assert.ok(actions.some((item) => item.action === "CONVERSATION_REOPENED"));
    assert.ok(await prisma.activity.count({ where: { workspaceId: workspace.id, entityId: unknownConversationId, action: "CONVERSATION_CONTACT_LINKED" } })); pass("AH");
    const detail = await getConversationDetails(owner, mainConversation.id);
    assert.ok(detail);
    assert.deepEqual(detail.messages.map((message) => message.id), [...detail.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((message) => message.id)); pass("AI");
    assert.equal(messageStatusLabel("READ"), "Leído"); pass("AJ");
    const unsupportedId = `qa-inbox-unsupported-${suffix}`;
    await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, unsupportedId, waKnown, now + 70, "image"));
    const unsupported = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: unsupportedId } });
    assert.equal(unsupported.type, "UNSUPPORTED");
    assert.equal(conversationPreview({ type: "UNSUPPORTED", textBody: null }), "Mensaje no compatible"); pass("AK");

    for (let i = 0; i < 31; i += 1) {
      await processWhatsAppWebhookPayload(inbound(phoneA, wabaId, `qa-inbox-page-${i}-${suffix}`, `60${String(i).padStart(10, "0")}${suffix.slice(0, 4)}`, now + 100 + i));
    }
    const firstPage = await listConversations(owner, {});
    assert.equal(firstPage.items.length, 30);
    assert.ok(firstPage.nextCursor);
    const secondPage = await listConversations(owner, { cursor: firstPage.nextCursor! });
    assert.ok(secondPage.items.length > 0);
    assert.ok(!secondPage.items.some((item) => firstPage.items.some((firstItem) => firstItem.id === item.id))); pass("AL");
    assert.ok((await listConversations(selected, { search: "Searchable" })).items.some((item) => item.id === mainConversation.id));
    assert.equal((await listConversations(selected, { search: "Restricted" })).items.length, 0); pass("AM");
    assert.ok((await getRecentConversationsForContact(owner, known.id)).some((item) => item.id === mainConversation.id)); pass("AN");
    assert.equal(await prisma.whatsAppMessage.count({ where: { workspaceId: workspace.id, conversationId: null } }), 0); pass("AO");
    assert.equal(connectionB.workspaceId, connectionA.workspaceId);
  } finally {
    await prisma.whatsAppWebhookEvent.deleteMany({ where: { wabaId } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, otherWorkspace.id] } } });
  }
  assert.equal(await prisma.workspace.count({ where: { id: { in: [workspace.id, otherWorkspace.id] } } }), 0);
  assert.equal(await prisma.whatsAppWebhookEvent.count({ where: { wabaId } }), 0);
}

async function runStaticTests() {
  const root = process.cwd();
  const repository = await readFile(path.join(root, "src/lib/conversation-repository.ts"), "utf8");
  const route = await readFile(path.join(root, "src/app/bandeja/[conversationId]/page.tsx"), "utf8");
  const webhook = await readFile(path.join(root, "src/lib/whatsapp/webhook-repository.ts"), "utf8");
  assert.ok(webhook.includes("prisma.$transaction") && webhook.includes("attachWhatsAppMessageToConversation")); pass("AP");
  assert.ok(repository.includes("LIMIT 31") && repository.includes("messages: { orderBy") && !repository.includes("for (const conversation")); pass("AQ");
  assert.ok(!route.includes("providerMessageId") && !route.includes("phoneNumberId") && !route.includes("wamid") && !route.includes("process.env")); pass("AR");
}

async function main() {
  await runStaticTests();
  if (process.env.INBOX_DB_QA === "1") await runDatabaseTests();
  const labels = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXY".split(""), "Z",
    ...["AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR"],
  ];
  if (process.env.INBOX_DB_QA === "1") assert.deepEqual([...passed].sort(), labels.sort());
  else assert.deepEqual([...passed].sort(), ["AP", "AQ", "AR"]);
  console.log(`Inbox QA: ${passed.size}/${labels.length} OK; QA cleanup complete`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
