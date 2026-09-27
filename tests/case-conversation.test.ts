import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GroupScopeMode, WorkspacePermission, WorkspaceRole, type Workspace } from "@prisma/client";

import type { AuthorizationContext } from "@/lib/authorization";
import { listWorkspaceActivity } from "@/lib/activity-repository";
import { getConversationCaseCreationContext, getCaseOrigin, linkCaseToConversation, listConversationCases } from "@/lib/case-conversation-repository";
import { CASE_TYPE } from "@/lib/case-types";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import { createOrder, getOrder } from "@/lib/order-service";
import { createTicket, getTicket } from "@/lib/ticket-service";

const runId = randomUUID();
const passed = new Set<string>();
const pass = (...labels: string[]) => labels.forEach((label) => passed.add(label));
const denied = (promise: Promise<unknown>) => assert.rejects(promise);

async function context(workspace: Workspace, role: WorkspaceRole, scope: GroupScopeMode, label: string): Promise<AuthorizationContext> {
  const member = await prisma.workspaceMember.create({ data: {
    workspaceId: workspace.id, userId: `qa-case-conversation-${label}-${runId}`, role, groupScopeMode: scope,
  } });
  return { userId: member.userId, memberId: member.id, workspaceId: workspace.id, workspace, role, groupScopeMode: scope,
    permissions: getEffectivePermissions(WorkspaceRole.OWNER, []),
  } as AuthorizationContext;
}

async function run() {
  const workspace = await prisma.workspace.create({ data: { name: `QA CaseConversation ${runId}` } });
  const foreign = await prisma.workspace.create({ data: { name: `QA CaseConversation foreign ${runId}` } });
  const ids = [workspace.id, foreign.id];
  try {
    await prisma.workspaceModule.createMany({ data: ["INBOX", "TICKETS", "ORDERS"].map((key) => ({ workspaceId: workspace.id, key, enabled: true })) });
    await prisma.workspaceModule.createMany({ data: ["INBOX", "TICKETS", "ORDERS"].map((key) => ({ workspaceId: foreign.id, key, enabled: true })) });
    const owner = await context(workspace, WorkspaceRole.OWNER, GroupScopeMode.ALL, "owner");
    const selected = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.SELECTED, "selected");
    const foreignOwner = await context(foreign, WorkspaceRole.OWNER, GroupScopeMode.ALL, "foreign");
    const group = await prisma.group.create({ data: { workspaceId: workspace.id, name: "QA allowed" } });
    await prisma.memberGroupAccess.create({ data: { memberId: selected.memberId, groupId: group.id } });
    const digits = runId.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
    const contact = await prisma.client.create({ data: { workspaceId: workspace.id, name: "QA Contact", phone: `54${digits}`, phoneNormalized: `54${digits}`, clientGroups: { create: { groupId: group.id } } } });
    const blockedContact = await prisma.client.create({ data: { workspaceId: workspace.id, name: "QA Blocked", phone: `55${digits}`, phoneNormalized: `55${digits}` } });
    const foreignContact = await prisma.client.create({ data: { workspaceId: foreign.id, name: "QA Foreign", phone: `56${digits}`, phoneNormalized: `56${digits}` } });
    const now = new Date();
    const conversation = await prisma.conversation.create({ data: { workspaceId: workspace.id, externalParticipantId: `qa-conversation-${runId}`, clientId: contact.id, lastMessageAt: now } });
    const secondConversation = await prisma.conversation.create({ data: { workspaceId: workspace.id, externalParticipantId: `qa-conversation-second-${runId}`, clientId: contact.id, lastMessageAt: now } });
    const unlinked = await prisma.conversation.create({ data: { workspaceId: workspace.id, externalParticipantId: `qa-conversation-unlinked-${runId}`, lastMessageAt: now } });
    const blocked = await prisma.conversation.create({ data: { workspaceId: workspace.id, externalParticipantId: `qa-conversation-blocked-${runId}`, clientId: blockedContact.id, lastMessageAt: now } });
    const foreignConversation = await prisma.conversation.create({ data: { workspaceId: foreign.id, externalParticipantId: `qa-conversation-foreign-${runId}`, clientId: foreignContact.id, lastMessageAt: now } });
    const inbound = await prisma.whatsAppMessage.create({ data: { workspaceId: workspace.id, conversationId: conversation.id, phoneNumberId: "qa", direction: "INBOUND", type: "TEXT", status: "RECEIVED", textBody: "QA inbound source" } });
    const otherInbound = await prisma.whatsAppMessage.create({ data: { workspaceId: workspace.id, conversationId: secondConversation.id, phoneNumberId: "qa", direction: "INBOUND", type: "TEXT", status: "RECEIVED", textBody: "QA other source" } });
    const outbound = await prisma.whatsAppMessage.create({ data: { workspaceId: workspace.id, conversationId: conversation.id, phoneNumberId: "qa", direction: "OUTBOUND", type: "TEXT", status: "ACCEPTED", textBody: "QA outbound" } });
    const ticketInput = (origin?: { conversationId: string; sourceMessageId?: string }) => ({ contactId: contact.id, title: "QA ticket", description: "QA detail", origin });
    const orderInput = (origin?: { conversationId: string; sourceMessageId?: string }) => ({ contactId: contact.id, items: [{ description: "QA item", quantity: "2", unitPrice: "100" }], origin });

    const ticket = await createTicket(owner, ticketInput({ conversationId: conversation.id, sourceMessageId: inbound.id }));
    assert.ok(ticket); pass("A");
    assert.equal((await getConversationCaseCreationContext(owner, CASE_TYPE.TICKET, { conversationId: unlinked.id }))?.contactMissing, true);
    await denied(createTicket(owner, ticketInput({ conversationId: unlinked.id }))); pass("B");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "TICKETS" } }, data: { enabled: false } });
    await denied(createTicket(owner, ticketInput({ conversationId: conversation.id }))); pass("C");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "TICKETS" } }, data: { enabled: true } });
    const noTicket = { ...owner, permissions: new Set([...owner.permissions].filter((permission) => permission !== WorkspacePermission.TICKET_CREATE)) };
    await denied(createTicket(noTicket, ticketInput({ conversationId: conversation.id }))); pass("D");
    await denied(createTicket(selected, { contactId: blockedContact.id, title: "QA denied", origin: { conversationId: blocked.id } })); pass("E");
    await denied(createTicket(owner, ticketInput({ conversationId: foreignConversation.id })));
    await denied(prisma.caseConversation.create({ data: { workspaceId: workspace.id, caseId: ticket!.id, conversationId: foreignConversation.id } })); pass("F");
    assert.equal(ticket!.contactId, contact.id); pass("G");
    const link = await prisma.caseConversation.findUniqueOrThrow({ where: { caseId_conversationId: { caseId: ticket!.id, conversationId: conversation.id } } });
    assert.equal(link.workspaceId, workspace.id);
    await denied(prisma.caseConversation.create({ data: { workspaceId: workspace.id, caseId: ticket!.id, conversationId: conversation.id } })); pass("H");
    assert.equal(link.sourceMessageId, inbound.id); pass("I");
    await denied(createTicket(owner, ticketInput({ conversationId: conversation.id, sourceMessageId: otherInbound.id }))); pass("J");
    await denied(createTicket(owner, ticketInput({ conversationId: conversation.id, sourceMessageId: outbound.id }))); pass("K");
    await prisma.$transaction((transaction) => linkCaseToConversation(owner, ticket!, { conversationId: secondConversation.id }, transaction));
    assert.equal(await prisma.caseConversation.count({ where: { caseId: ticket!.id } }), 2); pass("L");
    const ticket2 = await createTicket(owner, ticketInput({ conversationId: conversation.id }));
    assert.ok(ticket2 && ticket2.id !== ticket!.id); pass("M");

    const order = await createOrder(owner, orderInput({ conversationId: conversation.id, sourceMessageId: inbound.id }));
    assert.ok(order); pass("N");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "ORDERS" } }, data: { enabled: false } });
    await denied(createOrder(owner, orderInput({ conversationId: conversation.id }))); pass("O");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "ORDERS" } }, data: { enabled: true } });
    const noOrder = { ...owner, permissions: new Set([...owner.permissions].filter((permission) => permission !== WorkspacePermission.ORDER_CREATE)) };
    await denied(createOrder(noOrder, orderInput({ conversationId: conversation.id }))); pass("P");
    assert.equal(order!.contactId, contact.id); pass("Q");
    assert.equal(order!.orderDetails!.total.toString(), "200"); assert.equal(order!.orderItems.length, 1); pass("R");
    const related = await listConversationCases(owner, conversation.id);
    assert.ok(related.some(({ case: item }) => item.id === ticket!.id)); pass("S");
    assert.ok(related.some(({ case: item }) => item.id === order!.id)); pass("T");
    assert.ok((await getCaseOrigin(owner, ticket!.id)).some(({ conversation: item }) => item.id === conversation.id)); pass("U");
    assert.ok((await getCaseOrigin(owner, order!.id)).some(({ conversation: item }) => item.id === conversation.id)); pass("V");
    const noInbox = { ...owner, permissions: new Set([...owner.permissions].filter((permission) => permission !== WorkspacePermission.INBOX_VIEW)) };
    await denied(getCaseOrigin(noInbox, ticket!.id)); pass("W");
    assert.ok(!(await listWorkspaceActivity(noInbox, "all")).items.some((item) => item.entityType === "CONVERSATION"));
    const blockedTicket = await createTicket(owner, { contactId: blockedContact.id, title: "QA blocked ticket", origin: { conversationId: blocked.id } });
    assert.ok(blockedTicket);
    assert.equal((await listConversationCases(selected, blocked.id)).length, 0);
    assert.equal((await getCaseOrigin(selected, ticket!.id)).length, 2);
    assert.ok(!(await listWorkspaceActivity(selected, "all")).items.some((item) => item.entityId === blocked.id)); pass("X");
    await prisma.conversation.update({ where: { id: conversation.id }, data: { clientId: blockedContact.id } });
    assert.equal((await getTicket(owner, ticket!.number))?.contactId, contact.id);
    assert.equal((await getOrder(owner, order!.number))?.contactId, contact.id); pass("Y");
    await prisma.conversation.update({ where: { id: conversation.id }, data: { clientId: contact.id, status: "ARCHIVED" } });
    const archived = await createTicket(owner, ticketInput({ conversationId: conversation.id })); assert.ok(archived); pass("Z");
    const activities = await prisma.activity.findMany({ where: { workspaceId: workspace.id, action: "CONVERSATION_CASE_LINKED" } });
    assert.ok(activities.some((item) => item.entityId === conversation.id && (item.metadata as { caseType?: string }).caseType === CASE_TYPE.TICKET)); pass("AA");
    assert.ok(activities.every((item) => !JSON.stringify(item.metadata).includes(inbound.textBody!))); pass("AB");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: false } });
    assert.ok(await getTicket(owner, ticket!.number)); assert.ok(await getOrder(owner, order!.number)); pass("AC");
    assert.equal(await prisma.caseConversation.count({ where: { workspaceId: workspace.id } }), 6); pass("AD");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: true } });
    assert.equal(await prisma.caseConversation.count({ where: { sourceMessageId: inbound.id } }), 2); pass("AE");
    const normalTicket = await createTicket(owner, ticketInput());
    const normalOrder = await createOrder(owner, orderInput());
    assert.ok(normalTicket && normalOrder && await prisma.caseConversation.count({ where: { caseId: { in: [normalTicket.id, normalOrder.id] } } }) === 0); pass("AG");
    assert.equal((await listConversationCases(foreignOwner, foreignConversation.id)).length, 0);
    const noTicketView = { ...owner, permissions: new Set([...owner.permissions].filter((permission) => permission !== WorkspacePermission.TICKET_VIEW)) };
    const noOrderView = { ...owner, permissions: new Set([...owner.permissions].filter((permission) => permission !== WorkspacePermission.ORDER_VIEW)) };
    assert.equal((await getCaseOrigin(noTicketView, ticket!.id)).length, 0);
    assert.equal((await getCaseOrigin(noOrderView, order!.id)).length, 0);
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
  }
  assert.equal(await prisma.workspace.count({ where: { id: { in: ids } } }), 0);
  assert.equal(await prisma.caseConversation.count({ where: { workspaceId: { in: ids } } }), 0);
}

async function staticChecks() {
  const root = process.cwd();
  const conversationPage = await readFile(path.join(root, "src/app/bandeja/[conversationId]/page.tsx"), "utf8");
  const ticketPage = await readFile(path.join(root, "src/app/tickets/[number]/page.tsx"), "utf8");
  const orderPage = await readFile(path.join(root, "src/app/pedidos/[number]/page.tsx"), "utf8");
  const webhook = await readFile(path.join(root, "src/lib/whatsapp/webhook-service.ts"), "utf8");
  const reply = await readFile(path.join(root, "src/lib/whatsapp/conversation-send-service.ts"), "utf8");
  assert.ok(conversationPage.includes("Crear ticket desde este mensaje") && conversationPage.includes("Crear pedido desde este mensaje"));
  assert.ok(!conversationPage.includes("providerMessageId") && !conversationPage.includes("phoneNumberId") && !conversationPage.includes("process.env")); pass("AF");
  assert.ok(ticketPage.includes("CaseOrigin") && orderPage.includes("CaseOrigin"));
  assert.ok(webhook.includes("processWhatsAppWebhookPayload") && reply.includes("sendConversationReply")); pass("AH");
}

async function main() {
  await staticChecks();
  await run();
  const labels = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"];
  assert.deepEqual([...passed].sort(), labels.sort());
  console.log(`CaseConversation QA: ${passed.size}/${labels.length} OK; temporary workspaces and links cleaned`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
