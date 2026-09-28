import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { Webhook } from "svix";
import { GroupScopeMode, WorkspacePermission, WorkspaceRole, type Workspace } from "@prisma/client";
import type { AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { normalizeOptionalEmail } from "@/lib/email";
import { persistInboundEmail } from "@/lib/email-inbound/repository";
import { getEmailConnections } from "@/lib/email-connection-repository";
import { parseResendEmail, ResendEmailInboundProvider } from "@/lib/email-inbound/resend-provider";
import { processEmailInboundEvent } from "@/lib/email-inbound/service";
import { createEmailWebhookHandler } from "@/lib/email-inbound/webhook-handler";
import { safeEmailText } from "@/lib/email-inbound/content";
import type { EmailInboundEvent } from "@/lib/email-inbound/types";
import { getConversationDetails, getRecentConversationsForContact, linkConversationContact, listConversations, markConversationRead, requireInboxAccess, setConversationArchived } from "@/lib/conversation-repository";
import { getConversationCaseCreationContext } from "@/lib/case-conversation-repository";
import { sendConversationReply } from "@/lib/whatsapp/conversation-send-service";
import { EmailThread } from "@/components/inbox/email-thread";
import { ConversationList } from "@/components/inbox/conversation-list";

const suffix = randomUUID();
const passed = new Set<string>();
const pass = (...labels: string[]) => { labels.forEach((label) => passed.add(label)); console.log(`PASS ${labels.join(", ")}`); };
const testSecret = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;
const environment = { ...process.env, RESEND_INBOUND_WEBHOOK_SECRET: testSecret, RESEND_INBOUND_API_KEY: "qa-only-in-memory" };
const bodies = new Map<string, Record<string, unknown>>();
let retrievals = 0;
const provider = new ResendEmailInboundProvider(environment, async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, "api.resend.com"); assert.equal(init?.method, "GET");
  assert.equal(url.searchParams.get("html_format"), "cid");
  retrievals++;
  const id = url.pathname.split("/").at(-1)!;
  assert.ok(bodies.has(id));
  return Response.json(bodies.get(id));
});
globalThis.fetch = async () => { throw new Error("Unexpected external request blocked by email QA."); };
const baseTime = Date.now() - 100000;
let tick = 0;

function email(address: string, overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  const raw = { id, from: "Persona <sender@example.test>", to: [address], cc: [], message_id: `<${id}@example.test>`,
    subject: "Consulta presupuesto", text: "Hola, consulta de prueba.", html: null,
    created_at: new Date(baseTime + ++tick * 1000).toISOString(), headers: {}, attachments: [], ...overrides,
  };
  bodies.set(id, raw);
  const event: EmailInboundEvent = { provider: "RESEND", eventKey: `resend:qa-${suffix}-${id}`, eventType: "email.received", providerMessageId: id, toAddresses: [address] };
  return { id, raw, event };
}
function signedRequest(sample: ReturnType<typeof email>, signature?: string) {
  const raw = JSON.stringify({ type: "email.received", data: { email_id: sample.id, to: sample.raw.to } });
  const id = sample.event.eventKey.slice("resend:".length);
  const timestamp = new Date();
  return new Request("https://example.test/api/webhooks/email", { method: "POST", body: raw, headers: {
    "svix-id": id, "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature ?? new Webhook(testSecret).sign(id, timestamp, raw),
  } });
}
async function context(workspace: Workspace, role: WorkspaceRole, groupScopeMode: GroupScopeMode): Promise<AuthorizationContext> {
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: `qa-email-${randomUUID()}`, role, groupScopeMode } });
  return { workspace, userId: member.userId, workspaceId: workspace.id, memberId: member.id, role, groupScopeMode, permissions: getEffectivePermissions(role, []) } as AuthorizationContext;
}

async function main() {
  const workspace = await prisma.workspace.create({ data: { name: `QA Email A ${suffix}` } });
  const foreign = await prisma.workspace.create({ data: { name: `QA Email B ${suffix}` } });
  try {
    const owner = await context(workspace, WorkspaceRole.OWNER, GroupScopeMode.ALL);
    const member = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.ALL);
    const selected = await context(workspace, WorkspaceRole.AGENT, GroupScopeMode.SELECTED);
    const other = await context(foreign, WorkspaceRole.OWNER, GroupScopeMode.ALL);
    await assert.rejects(requireInboxAccess(owner)); pass("AL");
    await prisma.workspaceModule.createMany({ data: [workspace, foreign].map((w) => ({ workspaceId: w.id, key: "INBOX", enabled: true })) });
    await assert.rejects(requireInboxAccess({ ...member, permissions: new Set() })); pass("AM");
    const address = normalizeOptionalEmail(` Inbox-${suffix}@example.test `)!;
    const connection = await prisma.emailConnection.create({ data: { workspaceId: workspace.id, provider: "RESEND", address } });
    const otherConnection = await prisma.emailConnection.create({ data: { workspaceId: foreign.id, provider: "RESEND", address: `other-${suffix}@example.test` } });
    assert.equal((await getEmailConnections(owner))[0].id, connection.id); pass("A");
    assert.equal((await getEmailConnections(other))[0].id, otherConnection.id);
    assert.ok(!(await getEmailConnections(other)).some((c) => c.id === connection.id));
    await assert.rejects(prisma.conversation.create({ data: { workspaceId: foreign.id, emailConnectionId: connection.id, channel: "EMAIL", externalParticipantId: "sender@example.test", lastMessageAt: new Date() } })); pass("B");
    const group = await prisma.group.create({ data: { workspaceId: workspace.id, name: "QA Email allowed" } });
    await prisma.memberGroupAccess.create({ data: { groupId: group.id, memberId: selected.memberId } });
    const client = await prisma.client.create({ data: { workspaceId: workspace.id, name: "QA Email Contact", email: "sender@example.test", phone: suffix, phoneNormalized: suffix, clientGroups: { create: { groupId: group.id } } } });
    await prisma.client.create({ data: { workspaceId: foreign.id, name: "Foreign same email", email: client.email, phone: suffix, phoneNormalized: suffix } });
    const first = email(address);
    const verifiedRequest = signedRequest(first);
    provider.verifyWebhook(await verifiedRequest.text(), verifiedRequest.headers);
    const logs: unknown[] = [];
    const handler = createEmailWebhookHandler({ provider, logger: { info: (...data) => logs.push(data), error: (...data) => logs.push(data) } });
    assert.equal((await handler(signedRequest(first, "v1,invalid"))).status, 401);
    assert.equal(await prisma.emailWebhookEvent.count({ where: { eventKey: first.event.eventKey } }), 0); pass("D");
    assert.equal((await handler(signedRequest(first))).status, 200); pass("C");
    const message = await prisma.emailMessage.findUniqueOrThrow({ where: { emailConnectionId_providerMessageId: { emailConnectionId: connection.id, providerMessageId: first.id } } });
    assert.equal(message.direction, "INBOUND"); pass("F");
    let conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: message.conversationId } });
    assert.equal(conversation.channel, "EMAIL"); assert.equal(conversation.whatsappConnectionId, null); pass("G");
    assert.equal(conversation.subject, first.raw.subject); pass("L");
    assert.equal(message.textBody, first.raw.text); pass("M");
    assert.equal(conversation.clientId, client.id); pass("Q");
    const beforeRetrieval = retrievals;
    assert.equal((await handler(signedRequest(first))).status, 200);
    assert.equal(retrievals, beforeRetrieval);
    await Promise.all([processEmailInboundEvent({ ...first.event, eventKey: `${first.event.eventKey}-retry1` }, provider), processEmailInboundEvent({ ...first.event, eventKey: `${first.event.eventKey}-retry2` }, provider)]);
    assert.equal(await prisma.emailMessage.count({ where: { emailConnectionId: connection.id, providerMessageId: first.id } }), 1); pass("E");
    const reply = email(address, { headers: { "In-Reply-To": first.raw.message_id, References: first.raw.message_id }, subject: "Re: Consulta presupuesto" });
    await processEmailInboundEvent(reply.event, provider);
    const getMessage = (id: string) => prisma.emailMessage.findUniqueOrThrow({ where: { emailConnectionId_providerMessageId: { emailConnectionId: connection.id, providerMessageId: id } } });
    assert.equal((await getMessage(reply.id)).conversationId, conversation.id); pass("H");
    const third = email(address, { headers: { References: `${first.raw.message_id} ${reply.raw.message_id}` } });
    await processEmailInboundEvent(third.event, provider);
    assert.equal((await getMessage(third.id)).conversationId, conversation.id); pass("I");
    const separate = email(address, { subject: "Otro asunto" });
    await processEmailInboundEvent(separate.event, provider);
    assert.notEqual((await getMessage(separate.id)).conversationId, conversation.id); pass("J");
    const sameSubject = email(address);
    await processEmailInboundEvent(sameSubject.event, provider);
    assert.notEqual((await getMessage(sameSubject.id)).conversationId, conversation.id); pass("K");
    const unknown = email(address, { from: "Desconocida <unknown@example.test>" });
    await processEmailInboundEvent(unknown.event, provider);
    const unknownMessage = await getMessage(unknown.id);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: unknownMessage.conversationId } })).clientId, null); pass("R");
    assert.ok((await listConversations(owner, {})).items.some((r) => r.id === unknownMessage.conversationId)); pass("S");
    assert.ok(!(await listConversations(selected, {})).items.some((r) => r.id === unknownMessage.conversationId)); pass("T");
    assert.ok((await listConversations(selected, {})).items.some((r) => r.id === conversation.id)); pass("U");
    assert.equal(await getConversationDetails(other, conversation.id), null); pass("V");
    assert.ok((await listConversations(owner, { filter: "unread", channel: "EMAIL" })).items.some((r) => r.id === conversation.id)); pass("W");
    await markConversationRead(owner, conversation.id);
    assert.ok(!(await listConversations(owner, { filter: "unread" })).items.some((r) => r.id === conversation.id)); pass("X");
    assert.ok((await listConversations(member, { filter: "unread" })).items.some((r) => r.id === conversation.id)); pass("Y");
    await setConversationArchived(owner, conversation.id, true);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).status, "ARCHIVED"); pass("Z");
    const reopen = email(address, { headers: { "in-reply-to": first.raw.message_id }, attachments: [{ filename: "file.pdf", content_type: "application/pdf" }] });
    await processEmailInboundEvent(reopen.event, provider);
    conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    assert.equal(conversation.status, "OPEN"); assert.equal(conversation.lastInboundAt?.toISOString(), reopen.raw.created_at); assert.equal(conversation.lastOutboundAt, null); pass("AA");
    assert.equal((await getMessage(reopen.id)).attachmentCount, 1); pass("AO");
    const whatsapp = await prisma.conversation.create({ data: { workspaceId: workspace.id, externalParticipantId: "qa-whatsapp", lastMessageAt: new Date(baseTime), channel: "WHATSAPP" } });
    const mixed = await listConversations(owner, {});
    assert.ok(mixed.items.some((r) => r.channel === "EMAIL") && mixed.items.some((r) => r.id === whatsapp.id));
    assert.deepEqual(mixed.items.map((r) => r.lastMessageAt.getTime()), mixed.items.map((r) => r.lastMessageAt.getTime()).sort((a, b) => b - a)); pass("AB");
    assert.ok((await listConversations(owner, { channel: "WHATSAPP" })).items.every((r) => r.channel === "WHATSAPP")); pass("AC");
    assert.ok((await listConversations(owner, { channel: "EMAIL" })).items.every((r) => r.channel === "EMAIL")); pass("AD");
    assert.ok((await listConversations(selected, { search: client.email! })).items.some((r) => r.id === conversation.id)); pass("AE");
    assert.ok((await listConversations(owner, { search: "unknown@" })).items.some((r) => r.id === unknownMessage.conversationId)); pass("AF");
    assert.ok((await listConversations(owner, { search: "presupuesto", channel: "EMAIL" })).items.some((r) => r.id === conversation.id)); pass("AG");
    await prisma.conversation.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ workspaceId: workspace.id, channel: "WHATSAPP", externalParticipantId: `qa-page-${i}-${suffix}`, lastMessageAt: new Date(baseTime - i * 1000) })) });
    const page = await listConversations(owner, {});
    assert.equal(page.items.length, 30); assert.ok(page.nextCursor);
    const page2 = await listConversations(owner, { cursor: page.nextCursor! });
    assert.ok(page2.items.length && !page2.items.some((r) => page.items.some((previous) => previous.id === r.id))); pass("AH");
    assert.ok((await getRecentConversationsForContact(owner, client.id)).some((r) => r.channel === "EMAIL")); pass("AI");
    const detail = await getConversationDetails(owner, conversation.id);
    assert.ok(detail);
    const markup = renderToStaticMarkup(<EmailThread conversation={detail} canManage={true} canLink={false} canCreate={false} canViewContact={true} groupRequired={false} linkSearch="" contacts={[]} groups={[]} />);
    assert.ok(markup.includes("Las respuestas por email") && !markup.includes("Enviar") && !markup.includes("Crear ticket") && !markup.includes("Crear pedido")); pass("AK");
    const unsafe = email(address, { text: null, html: '<p>Hola &amp; gracias</p><script>alert(1)</script><iframe src="https://tracker.test"></iframe><form>secret form</form><img src="https://tracker.test/pixel"><p>&lt;script&gt;literal&lt;/script&gt;</p>' });
    await processEmailInboundEvent(unsafe.event, provider);
    const unsafeMessage = await getMessage(unsafe.id);
    assert.ok(unsafeMessage.htmlBody?.includes("<script>"));
    const unsafeDetail = await getConversationDetails(owner, unsafeMessage.conversationId);
    assert.ok(unsafeDetail);
    const safeMarkup = renderToStaticMarkup(<EmailThread conversation={unsafeDetail} canManage={false} canLink={false} canCreate={false} canViewContact={false} groupRequired={false} linkSearch="" contacts={[]} groups={[]} />);
    assert.ok(!safeMarkup.includes("<script") && !safeMarkup.includes("<iframe") && !safeMarkup.includes("<form")); pass("N", "O");
    assert.ok(!safeMarkup.includes("<img") && !safeMarkup.includes("tracker.test")); pass("P");
    assert.ok(safeMarkup.includes("&lt;script&gt;literal"));
    const blankText = email(address, { text: " ", html: "<p>HTML fallback seguro</p>" });
    await processEmailInboundEvent(blankText.event, provider);
    assert.equal((await getMessage(blankText.id)).textBody, "HTML fallback seguro");
    const empty = email(address, { text: null, html: null }); await processEmailInboundEvent(empty.event, provider);
    const emptyDetail = await getConversationDetails(owner, (await getMessage(empty.id)).conversationId);
    assert.ok(emptyDetail);
    assert.ok(renderToStaticMarkup(<EmailThread conversation={emptyDetail} canManage={false} canLink={false} canCreate={false} canViewContact={false} groupRequired={false} linkSearch="" contacts={[]} groups={[]} />).includes("Contenido de email no disponible")); pass("AP");
    const unknownConnection = email(`unregistered-${suffix}@example.test`);
    assert.equal((await processEmailInboundEvent(unknownConnection.event, provider)).handled, false);
    assert.equal(await prisma.emailMessage.count({ where: { providerMessageId: unknownConnection.id } }), 0);
    const fault = email(address);
    const failing = createEmailWebhookHandler({ provider, processEvent: async () => { throw new Error("DB failure with sensitive details"); }, logger: { info: (...data) => logs.push(data), error: (...data) => logs.push(data) } });
    assert.equal((await failing(signedRequest(fault))).status, 500);
    assert.equal((await handler(signedRequest(fault))).status, 200); pass("AQ");
    assert.ok(!JSON.stringify(logs).includes(testSecret) && !JSON.stringify(logs).includes(environment.RESEND_INBOUND_API_KEY) && !JSON.stringify(logs).includes("sensitive details")); pass("AR");
    await linkConversationContact(owner, unknownMessage.conversationId, client.id);
    await assert.rejects(setConversationArchived({ ...member, permissions: new Set([WorkspacePermission.INBOX_VIEW]) }, conversation.id, true));
    await assert.rejects(linkConversationContact(other, conversation.id, client.id));
    await assert.rejects(markConversationRead(other, conversation.id));
    assert.equal(await prisma.activity.count({ where: { workspaceId: workspace.id, action: "CONVERSATION_CONTACT_LINKED" } }), 1); pass("AN");
    await assert.rejects(sendConversationReply(owner, { conversationId: conversation.id, body: "No email send", clientRequestId: randomUUID() }));
    await prisma.workspaceModule.create({ data: { workspaceId: workspace.id, key: "TICKETS", enabled: true } });
    assert.equal(await getConversationCaseCreationContext(owner, "TICKET", { conversationId: conversation.id }), null);
    const waPage = await readFile("src/app/bandeja/[conversationId]/page.tsx", "utf8");
    assert.ok(waPage.includes("<ReplyComposer") && waPage.includes("getWhatsAppServiceWindow")); pass("AJ");
    // A reply delivered before its parent still uses a stable References root.
    const parentId = `<late-${suffix}@example.test>`;
    const lateReply = email(address, { headers: { "in-reply-to": parentId, references: parentId } });
    await processEmailInboundEvent(lateReply.event, provider);
    const parent = email(address, { message_id: parentId }); await processEmailInboundEvent(parent.event, provider);
    assert.equal((await getMessage(lateReply.id)).conversationId, (await getMessage(parent.id)).conversationId);
    // A delayed delivery must not become the latest snippet or disturb chronological order.
    const delayed = email(address, { headers: { "in-reply-to": first.raw.message_id }, created_at: new Date(baseTime - 1000).toISOString(), subject: "Delayed older email" });
    await processEmailInboundEvent(delayed.event, provider);
    const chronological = await getConversationDetails(owner, conversation.id);
    assert.ok(chronological);
    assert.equal(chronological.emailMessages[0].id, (await getMessage(delayed.id)).id);
    assert.equal(chronological.emailMessages.at(-1)?.id, (await getMessage(reopen.id)).id);
    assert.equal(safeEmailText(null, "<style>bad</style><p>Safe</p>"), "Safe");
    assert.equal(parseResendEmail(first.raw, first.id).fromAddress, "sender@example.test");
    // Internet Message-ID also deduplicates deliveries with a new provider identifier.
    const resendCopy = email(address, { message_id: first.raw.message_id }); await processEmailInboundEvent(resendCopy.event, provider);
    assert.equal(await prisma.emailMessage.count({ where: { emailConnectionId: connection.id, internetMessageId: String(first.raw.message_id) } }), 1);
    const renderedList = renderToStaticMarkup(<ConversationList page={mixed} channel="EMAIL" filter="unread" query="presupuesto" />);
    assert.ok(renderedList.includes("Email") && renderedList.includes("WhatsApp") && renderedList.includes("channel=EMAIL") && renderedList.includes("filter=unread"));
    assert.equal(await prisma.client.count({ where: { workspaceId: workspace.id } }), 1, "No automatic contact creation");
    assert.ok(await prisma.$transaction((t) => persistInboundEmail(t, { id: connection.id, workspaceId: foreign.id }, parseResendEmail(first.raw, first.id))) === null);
  } finally {
    await prisma.emailWebhookEvent.deleteMany({ where: { eventKey: { startsWith: `resend:qa-${suffix}-` } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, foreign.id] } } });
  }
  assert.equal(await prisma.workspace.count({ where: { id: { in: [workspace.id, foreign.id] } } }), 0);
  assert.equal(await prisma.emailWebhookEvent.count({ where: { eventKey: { startsWith: `resend:qa-${suffix}-` } } }), 0);
  const expected = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), ...Array.from({ length: 18 }, (_, i) => `A${String.fromCharCode(65 + i)}`)];
  assert.deepEqual([...passed].sort(), expected.sort());
  console.log(`Email Inbox A–AR: ${passed.size}/44 OK; QA cleanup verified. AS–AV run in the existing regression suites.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
