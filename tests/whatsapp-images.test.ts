import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { GroupScopeMode, WorkspacePermission, WorkspaceRole, type Workspace } from "@prisma/client";
import type { AuthorizationContext } from "@/lib/authorization";
import { getCaseOrigin, getConversationCaseCreationContext } from "@/lib/case-conversation-repository";
import { buildCaseSourceDescription } from "@/lib/case-source-presentation";
import { conversationPreview } from "@/lib/conversation-presentation";
import { getConversationDetails, listConversations, markConversationRead } from "@/lib/conversation-repository";
import { createOrder } from "@/lib/order-service";
import { createTicket } from "@/lib/ticket-service";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import { WhatsAppCloudApiClient } from "@/lib/whatsapp/client";
import { serveConversationAttachment } from "@/lib/whatsapp/image-attachment-handler";
import { ImageAttachmentRetryError, processInboundImage } from "@/lib/whatsapp/image-attachment-service";
import { MAX_WHATSAPP_IMAGE_BYTES, verifyWhatsAppImage, WhatsAppMediaError } from "@/lib/whatsapp/image-media";
import type { PrivateImageStorage } from "@/lib/whatsapp/private-image-storage";
import { processWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-service";
import { parseWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-types";

const runId = randomUUID();
const passed = new Set<string>();
const pass = (...labels: string[]) => labels.forEach((label) => passed.add(label));
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0xff, 0xd9]);
const checksum = createHash("sha256").update(jpeg).digest("base64");
const config = { accessToken: "qa-injected-not-a-real-token", apiVersion: "v23.0", phoneNumberId: "1000000000", wabaId: "2000000000" };
const payload = (phone: string, waba: string, wamid: string, participant: string, type = "image", image: Record<string, unknown> = { id: "3000000000", mime_type: "image/jpeg", sha256: checksum, caption: "QA image caption" }) => ({
  object: "whatsapp_business_account", entry: [{ id: waba, changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phone }, messages: [{ id: wamid, from: participant, timestamp: String(Math.floor(Date.now() / 1000)), type, image, text: { body: "QA text" } }],
  } }] }],
});

async function mediaTests() {
  const [event] = parseWhatsAppWebhookPayload(payload(config.phoneNumberId, config.wabaId, "wamid.qa", "540000000000"));
  assert.equal(event.kind, "message");
  if (event.kind !== "message") throw new Error("Missing message");
  assert.equal(event.messageType, "IMAGE"); pass("A");
  assert.equal(event.image?.mediaId, "3000000000"); pass("B");
  assert.equal(event.image?.caption, "QA image caption");
  const withoutCaption = parseWhatsAppWebhookPayload(payload(config.phoneNumberId, config.wabaId, "wamid.no-caption", "540000000000", "image", { id: "3000000001", mime_type: "image/png" }))[0];
  assert.ok(withoutCaption.kind === "message" && withoutCaption.image?.caption === null); pass("C");
  assert.equal(event.image?.mimeType, "image/jpeg"); pass("D");
  assert.ok(withoutCaption.kind === "message" && withoutCaption.image?.mimeType === "image/png"); pass("E");
  const unsupported = parseWhatsAppWebhookPayload(payload(config.phoneNumberId, config.wabaId, "wamid.unsafe", "540000000000", "image", { id: "3", mime_type: "image/svg+xml", url: "https://untrusted.invalid/" }))[0];
  assert.ok(unsupported.kind === "message" && unsupported.messageType === "UNSUPPORTED" && unsupported.image === null); pass("F");
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    return calls.length === 1 ? Response.json({ id: "3000000000", url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?temporary=true", mime_type: "image/jpeg", file_size: jpeg.length, sha256: checksum })
      : new Response(jpeg, { headers: { "content-type": "image/jpeg", "content-length": String(jpeg.length) } });
  };
  const media = await new WhatsAppCloudApiClient(config, fetcher).retrieveImage("3000000000", "1000000001", { mimeType: "image/jpeg", sha256: checksum });
  assert.equal(calls[0].url, "https://graph.facebook.com/v23.0/3000000000?phone_number_id=1000000001"); pass("G");
  assert.equal(new Headers(calls[1].init?.headers).get("Authorization"), `Bearer ${config.accessToken}`);
  assert.equal(calls[1].init?.redirect, "error"); assert.deepEqual(media.bytes, jpeg); pass("H");
  assert.ok(!JSON.stringify(media).includes("lookaside") && !JSON.stringify(event.payload).includes("temporary"));
  const retrieveFailure = new WhatsAppCloudApiClient(config, async () => new Response(null, { status: 403 }));
  await assert.rejects(retrieveFailure.retrieveImage("3", "1", { mimeType: "image/jpeg" }), (error) => error instanceof WhatsAppMediaError && error.reason === "RETRIEVE_FAILED"); pass("M");
  let step = 0;
  const downloadFailure = new WhatsAppCloudApiClient(config, async () => ++step === 1 ? Response.json({ id: "3", url: "https://lookaside.fbsbx.com/media", mime_type: "image/jpeg", file_size: jpeg.length }) : new Response(null, { status: 500 }));
  await assert.rejects(downloadFailure.retrieveImage("3", "1", { mimeType: "image/jpeg" }), (error) => error instanceof WhatsAppMediaError && error.reason === "DOWNLOAD_FAILED"); pass("N");
  assert.throws(() => verifyWhatsAppImage(jpeg, "image/jpeg", [Buffer.alloc(32).toString("base64")]), /CHECKSUM_MISMATCH/); pass("AH");
  assert.throws(() => verifyWhatsAppImage(Buffer.alloc(MAX_WHATSAPP_IMAGE_BYTES + 1), "image/jpeg", []), /INVALID_SIZE/);
  assert.throws(() => verifyWhatsAppImage(Buffer.from("<svg>"), "image/jpeg", []), /INVALID_MIME/);
  const malicious = new WhatsAppCloudApiClient(config, async () => Response.json({ id: "3", url: "https://example.invalid/steal", mime_type: "image/jpeg", file_size: jpeg.length }));
  await assert.rejects(malicious.retrieveImage("3", "1", { mimeType: "image/jpeg" }), /INVALID_MEDIA_URL/);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); assert.ok(verifyWhatsAppImage(png, "image/png", []));
}

async function context(workspace: Workspace, scope: GroupScopeMode, label: string): Promise<AuthorizationContext> {
  const role = scope === GroupScopeMode.ALL ? WorkspaceRole.OWNER : WorkspaceRole.AGENT;
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: `qa-image-${label}-${runId}`, role, groupScopeMode: scope } });
  return { userId: member.userId, memberId: member.id, workspaceId: workspace.id, workspace, role, groupScopeMode: scope, permissions: getEffectivePermissions(WorkspaceRole.OWNER, []) } as AuthorizationContext;
}

async function databaseTests() {
  const workspace = await prisma.workspace.create({ data: { name: `QA Image ${runId}` } });
  const foreign = await prisma.workspace.create({ data: { name: `QA Image foreign ${runId}` } });
  const ids = [workspace.id, foreign.id];
  const digits = runId.replace(/\D/g, "").padEnd(10, "0").slice(0, 10);
  const phone = `9${digits}`, waba = `8${digits}`, participant = `54${digits}`;
  const blobs = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  let downloads = 0, uploads = 0;
  const storage: PrivateImageStorage = {
    async stat(path) { const blob = blobs.get(path); return blob ? { sizeBytes: blob.bytes.byteLength, mimeType: blob.mimeType } : null; },
    async upload(path, bytes, mimeType) { uploads++; assert.ok(!blobs.has(path)); blobs.set(path, { bytes, mimeType }); },
  };
  const media = { async retrieveImage() { downloads++; return { bytes: jpeg, mimeType: "image/jpeg" as const, sizeBytes: jpeg.length, sha256: checksum }; } };
  const imageWamid = `wamid.qa.image.${runId}`;
  const read: Parameters<typeof serveConversationAttachment>[2] = async (path) => {
    const blob = blobs.get(path); assert.ok(blob);
    return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(blob.bytes); controller.close(); } }), blob: { contentType: blob.mimeType, size: blob.bytes.byteLength } } as Awaited<ReturnType<NonNullable<Parameters<typeof serveConversationAttachment>[2]>>>;
  };
  try {
    await prisma.workspaceModule.createMany({ data: ["INBOX", "TICKETS", "ORDERS"].map((key) => ({ workspaceId: workspace.id, key, enabled: true })) });
    await prisma.workspaceModule.create({ data: { workspaceId: foreign.id, key: "INBOX", enabled: true } });
    const owner = await context(workspace, GroupScopeMode.ALL, "owner"), selected = await context(workspace, GroupScopeMode.SELECTED, "selected"), foreignOwner = await context(foreign, GroupScopeMode.ALL, "foreign");
    const connection = await prisma.whatsAppConnection.create({ data: { workspaceId: workspace.id, phoneNumberId: phone, wabaId: waba } });
    const contact = await prisma.client.create({ data: { workspaceId: workspace.id, name: "QA Image Contact", phone: participant, phoneNormalized: participant } });
    const textPayload = payload(phone, waba, `wamid.qa.text.${runId}`, participant, "text");
    await processWhatsAppWebhookPayload(textPayload);
    const text = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: `wamid.qa.text.${runId}` } });
    assert.equal(text.type, "TEXT"); assert.equal(text.textBody, "QA text"); pass("AI");
    const conversationId = text.conversationId!;
    await markConversationRead(owner, conversationId);
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "ARCHIVED" } });
    const imagePayload = payload(phone, waba, imageWamid, participant);
    // Confirm message/attachment have committed before any external IO.
    const committedMedia = { async retrieveImage() { assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: imageWamid } }), 1); return media.retrieveImage(); } };
    await processWhatsAppWebhookPayload(imagePayload, { processImage: (id, number) => processInboundImage(id, number, { storage, media: committedMedia }) });
    const message = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: imageWamid }, include: { attachments: true } });
    assert.equal(message.type, "IMAGE"); assert.equal(message.clientId, contact.id); assert.equal(message.conversationId, conversationId);
    const attachment = message.attachments[0]; assert.equal(attachment.status, "READY"); assert.equal(attachment.sizeBytes, jpeg.length); pass("K");
    assert.ok(!JSON.stringify(attachment).includes("lookaside") && !JSON.stringify(await prisma.whatsAppWebhookEvent.findMany({ where: { workspaceId: workspace.id } })).includes("temporary")); pass("I");
    assert.ok(!attachment.storagePath.includes(participant) && attachment.storagePath.startsWith(`whatsapp/${workspace.id}/${conversationId}/${message.id}/`)); pass("AG");
    await processWhatsAppWebhookPayload(imagePayload, { processImage: (id, number) => processInboundImage(id, number, { storage, media }) });
    assert.equal(downloads, 1); assert.equal(uploads, 1); assert.equal(blobs.size, 1);
    assert.equal(await prisma.whatsAppMessageAttachment.count({ where: { messageId: message.id } }), 1); pass("L");
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).status, "OPEN"); pass("Z");
    // Use a later sentAt so same-second text/image timestamps cannot mask unread semantics.
    await prisma.whatsAppMessage.update({ where: { id: message.id }, data: { sentAt: new Date(Date.now() + 2000) } });
    assert.equal((await listConversations(owner, { filter: "unread" })).items.some((item) => item.id === conversationId), true); pass("Y");
    assert.equal(await prisma.activity.count({ where: { workspaceId: workspace.id } }), 0);
    assert.equal(await prisma.client.count({ where: { workspaceId: workspace.id } }), 1);
    assert.equal((await getConversationDetails(owner, conversationId))?.messages.at(-1)?.attachments[0]?.id, attachment.id);
    assert.equal((await serveConversationAttachment(null, attachment.id, read)).status, 401); pass("Q");
    const mustNotRead: NonNullable<typeof read> = async () => { throw new Error("Unauthorized storage read"); };
    assert.equal((await serveConversationAttachment(foreignOwner, attachment.id, mustNotRead)).status, 404); pass("R");
    assert.equal((await serveConversationAttachment(selected, attachment.id, mustNotRead)).status, 404);
    const group = await prisma.group.create({ data: { workspaceId: workspace.id, name: "QA Image allowed" } });
    await prisma.clientGroup.create({ data: { clientId: contact.id, groupId: group.id } });
    await prisma.memberGroupAccess.create({ data: { memberId: selected.memberId, groupId: group.id } });
    const allowed = await serveConversationAttachment(selected, attachment.id, read); assert.equal(allowed.status, 200); assert.equal(allowed.headers.get("Cache-Control"), "private, no-store, max-age=0"); assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), jpeg); pass("S");
    const noInbox = { ...owner, permissions: new Set([...owner.permissions].filter((permission) => permission !== WorkspacePermission.INBOX_VIEW)) };
    assert.equal((await serveConversationAttachment(noInbox, attachment.id, mustNotRead)).status, 404); pass("T");
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: false } });
    assert.equal((await serveConversationAttachment(owner, attachment.id, mustNotRead)).status, 404);
    await prisma.workspaceModule.update({ where: { workspaceId_key: { workspaceId: workspace.id, key: "INBOX" } }, data: { enabled: true } });
    const origin = { conversationId, sourceMessageIds: [message.id, text.id] };
    const creation = await getConversationCaseCreationContext(owner, "TICKET", origin);
    assert.ok(creation?.sourceMessages.some((item) => item.type === "IMAGE")); pass("AA");
    assert.equal(creation?.sourceMessages.length, 2);
    assert.equal(buildCaseSourceDescription(creation!.sourceMessages), "QA text\n\nDescripción de imagen: QA image caption");
    assert.equal(buildCaseSourceDescription([{ type: "IMAGE", textBody: null, attachments: [{ caption: null }] }]), ""); pass("AB");
    const ticket = await createTicket(owner, { contactId: contact.id, title: "QA Image ticket", origin });
    const order = await createOrder(owner, { contactId: contact.id, items: [{ description: "QA explicit item", quantity: "1", unitPrice: "1" }], origin });
    for (const [item, label] of [[ticket, "AC"], [order, "AD"]] as const) {
      assert.ok(item); const link = await prisma.caseConversation.findUniqueOrThrow({ where: { caseId_conversationId: { caseId: item.id, conversationId } }, include: { sourceMessages: true } });
      assert.equal(link.sourceMessages.length, 2); assert.deepEqual(link.sourceMessages.map(({ messageId }) => messageId).sort(), [message.id, text.id].sort()); pass(label);
    }
    const source = await getCaseOrigin(owner, ticket!.id);
    assert.equal(source[0].sourceMessages.find((item) => item.messageId === message.id)?.message.attachments[0]?.id, attachment.id); pass("AE");
    await assert.rejects(getCaseOrigin(noInbox, ticket!.id)); pass("AF");
    assert.ok((await prisma.activity.findMany({ where: { workspaceId: workspace.id } })).every((item) => !JSON.stringify(item.metadata).includes("QA image caption")));
    const failingId = `wamid.qa.failed.${runId}`;
    await processWhatsAppWebhookPayload(payload(phone, waba, failingId, participant), { processImage: async () => {} });
    const failingMessage = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: failingId }, include: { attachments: true } });
    let first = true;
    const ambiguousUpload: PrivateImageStorage = { ...storage, async upload(path, bytes, mimeType) { await storage.upload(path, bytes, mimeType); if (first) { first = false; throw new Error("Simulated ambiguous upload"); } } };
    await assert.rejects(processInboundImage(failingId, phone, { storage: ambiguousUpload, media }), ImageAttachmentRetryError);
    assert.equal((await prisma.whatsAppMessageAttachment.findUniqueOrThrow({ where: { id: failingMessage.attachments[0].id } })).status, "FAILED"); pass("O");
    assert.equal(await prisma.whatsAppMessage.count({ where: { id: failingMessage.id } }), 1); pass("P");
    const beforeRecovery = downloads;
    await processInboundImage(failingId, phone, { storage: ambiguousUpload, media });
    assert.equal(downloads, beforeRecovery); assert.equal(blobs.size, 2); // recovers same immutable blob, not another upload.
    const expiredId = failingMessage.attachments[0].id;
    await prisma.whatsAppMessageAttachment.update({ where: { id: expiredId }, data: { status: "PROCESSING", attempts: 5, processingToken: randomUUID(), processingExpiresAt: new Date(0) } });
    await processInboundImage(failingId, phone, { storage, media });
    assert.equal((await prisma.whatsAppMessageAttachment.findUniqueOrThrow({ where: { id: expiredId } })).status, "FAILED");
    const concurrentId = `wamid.qa.concurrent.${runId}`;
    await processWhatsAppWebhookPayload(payload(phone, waba, concurrentId, participant), { processImage: async () => {} });
    const downloadsBefore = downloads;
    await Promise.allSettled([processInboundImage(concurrentId, phone, { storage, media }), processInboundImage(concurrentId, phone, { storage, media })]);
    assert.equal(downloads, downloadsBefore + 1); assert.equal(blobs.size, 3);
    const statusWamid = `wamid.qa.status.${runId}`;
    for (const status of ["read", "delivered", "sent", "read"]) await processWhatsAppWebhookPayload({ entry: [{ id: waba, changes: [{ field: "messages", value: { metadata: { phone_number_id: phone }, statuses: [{ id: statusWamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: participant }] } }] }] });
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: statusWamid } })).status, "READ");
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: statusWamid } }), 1); pass("AJ");
    assert.equal(await prisma.whatsAppConnection.count({ where: { id: connection.id } }), 1);
  } finally { await prisma.workspace.deleteMany({ where: { id: { in: ids } } }); }
  assert.equal(await prisma.workspace.count({ where: { id: { in: ids } } }), 0);
  assert.equal(await prisma.whatsAppMessageAttachment.count({ where: { workspaceId: { in: ids } } }), 0);
  assert.equal(await prisma.whatsAppWebhookEvent.count({ where: { workspaceId: { in: ids } } }), 0);
  assert.equal(await prisma.activity.count({ where: { workspaceId: { in: ids } } }), 0);
  console.log("Image QA cleanup: all temporary workspaces, messages, attachments, events and Activity removed; no real Meta/Blob IO");
}

async function uiChecks() {
  assert.equal(conversationPreview({ type: "IMAGE", textBody: null }), "Imagen");
  assert.equal(conversationPreview({ type: "IMAGE", textBody: null, attachments: [{ caption: "QA caption" }] }), "Imagen · QA caption"); pass("U");
  const component = await readFile("src/components/inbox/conversation-image.tsx", "utf8");
  const thread = await readFile("src/app/bandeja/[conversationId]/page.tsx", "utf8");
  const origin = await readFile("src/components/cases/case-origin.tsx", "utf8");
  const storage = await readFile("src/lib/whatsapp/private-image-storage.ts", "utf8");
  assert.ok(storage.includes('access: "private"') && storage.includes("allowOverwrite: false") && !storage.includes("BLOB_READ_WRITE_TOKEN")); pass("J");
  assert.ok(thread.includes('message.type === "IMAGE"') && thread.includes("ConversationImage"));
  assert.ok(component.includes("unoptimized") && component.includes("/api/bandeja/attachments/") && component.includes("showModal()") && component.includes("<dialog")); pass("V");
  assert.ok(component.includes("attachment.caption") && component.includes("whitespace-pre-wrap")); pass("W");
  assert.ok(component.includes("Imagen no disponible") && component.includes("onError")); pass("X");
  assert.ok(origin.includes("ConversationImage") && !origin.includes("storagePath") && !component.includes("process.env"));
}

async function main() {
  await mediaTests(); await uiChecks(); await databaseTests();
  // AK/AL are separate existing runtime regression suites, not counted as passed here.
  const labels = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ"];
  assert.deepEqual([...passed].sort(), labels.sort());
  console.log(`WhatsApp images A–AJ: ${passed.size}/${labels.length} OK (UI checks structural; interactive smoke pending)`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
