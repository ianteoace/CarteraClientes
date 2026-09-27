import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { createWhatsAppWebhookHandlers } from "@/lib/whatsapp/webhook-handler";
import { processWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-service";
import {
  createWhatsAppWebhookSignature,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/webhook-signature";
import { WHATSAPP_MESSAGE_STATUS } from "@/lib/whatsapp/webhook-types";

const passed: string[] = [];
function pass(letter: string) {
  passed.push(letter);
}

const testEnvironment = {
  ...process.env,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "qa-verify-token",
  META_APP_SECRET: "qa-app-secret",
};

function signedRequest(payload: unknown, signature?: string) {
  const raw = Buffer.from(JSON.stringify(payload));
  return new Request("https://example.test/api/webhooks/whatsapp", {
    method: "POST",
    body: raw,
    headers: signature === undefined ? {} : { "x-hub-signature-256": signature },
  });
}

function statusPayload(input: {
  wabaId: string;
  phoneNumberId: string;
  providerMessageId: string;
  status: string;
  timestamp: string;
  waId?: string;
  error?: { code: number; title: string };
}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: input.wabaId,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: input.phoneNumberId },
          statuses: [{
            id: input.providerMessageId,
            status: input.status,
            timestamp: input.timestamp,
            recipient_id: input.waId ?? "541100000001",
            ...(input.error ? { errors: [input.error] } : {}),
          }],
        },
      }],
    }],
  };
}

function messageChange(input: {
  phoneNumberId: string;
  providerMessageId: string;
  from: string;
  type?: string;
  body?: string;
  timestamp?: string;
  profileName?: string;
}) {
  return {
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: input.phoneNumberId },
      contacts: [{ wa_id: input.from, profile: { name: input.profileName ?? "QA Profile" } }],
      messages: [{
        id: input.providerMessageId,
        from: input.from,
        timestamp: input.timestamp ?? "1700000000",
        type: input.type ?? "text",
        ...(input.type === undefined || input.type === "text"
          ? { text: { body: input.body ?? "Mensaje QA" } }
          : {}),
      }],
    },
  };
}

async function routeTests() {
  const processResult = [{
    eventKey: "message:qa",
    eventType: "message.text",
    duplicate: false,
    handled: true,
    phoneNumberId: "123456789012",
    providerMessageId: "qa-provider-id",
  }];
  const quietLogger = { info() {}, error() {} };
  const handlers = createWhatsAppWebhookHandlers({
    environment: testEnvironment,
    processPayload: async () => processResult,
    logger: quietLogger,
  });

  const validGet = await handlers.GET(new Request(
    "https://example.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=qa-verify-token&hub.challenge=challenge-123",
  ));
  assert.equal(validGet.status, 200);
  assert.equal(await validGet.text(), "challenge-123");
  pass("A");

  const invalidGet = await handlers.GET(new Request(
    "https://example.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x",
  ));
  assert.equal(invalidGet.status, 403);
  pass("B");

  const samplePayload = { entry: [] };
  assert.equal((await handlers.POST(signedRequest(samplePayload))).status, 401);
  pass("C");
  assert.equal((await handlers.POST(signedRequest(samplePayload, `sha256=${"0".repeat(64)}`))).status, 401);
  pass("D");

  const rawBody = Buffer.from(JSON.stringify(samplePayload));
  const validSignature = createWhatsAppWebhookSignature(rawBody, testEnvironment.META_APP_SECRET!);
  assert.equal((await handlers.POST(signedRequest(samplePayload, validSignature))).status, 200);
  pass("E");

  const independentSignature = `sha256=${createHmac("sha256", testEnvironment.META_APP_SECRET!).update(rawBody).digest("hex")}`;
  assert.equal(validSignature, independentSignature);
  assert.equal(verifyWhatsAppWebhookSignature(rawBody, independentSignature, testEnvironment.META_APP_SECRET!), true);
  assert.equal(verifyWhatsAppWebhookSignature(Buffer.from("changed"), independentSignature, testEnvironment.META_APP_SECRET!), false);
  pass("F");

  const logged: string[] = [];
  const loggingHandlers = createWhatsAppWebhookHandlers({
    environment: testEnvironment,
    processPayload: async () => processResult,
    logger: {
      info: (...values: unknown[]) => logged.push(JSON.stringify(values)),
      error: (...values: unknown[]) => logged.push(JSON.stringify(values)),
    },
  });
  await loggingHandlers.POST(signedRequest(samplePayload, validSignature));
  const logs = logged.join("\n");
  assert.equal(logs.includes(testEnvironment.META_APP_SECRET!), false);
  assert.equal(logs.includes(testEnvironment.WHATSAPP_WEBHOOK_VERIFY_TOKEN!), false);
  assert.equal(logs.includes("123456789012"), false);
  pass("V");

  const failingHandlers = createWhatsAppWebhookHandlers({
    environment: testEnvironment,
    processPayload: async () => { throw new Error("database unavailable"); },
    logger: quietLogger,
  });
  assert.equal((await failingHandlers.POST(signedRequest(samplePayload, validSignature))).status, 500);
  pass("W");
}

async function databaseTests() {
  const suffix = randomUUID();
  const wabaA = `qa-waba-a-${suffix}`;
  const wabaB = `qa-waba-b-${suffix}`;
  const phoneA = `91${suffix.replaceAll("-", "").slice(0, 14)}`;
  const phoneUnknown = `92${suffix.replaceAll("-", "").slice(0, 14)}`;
  const workspaceA = await prisma.workspace.create({ data: { name: `QA WhatsApp A ${suffix}` } });
  const workspaceB = await prisma.workspace.create({ data: { name: `QA WhatsApp B ${suffix}` } });

  try {
    const connection = await prisma.whatsAppConnection.create({
      data: { workspaceId: workspaceA.id, wabaId: wabaA, phoneNumberId: phoneA },
    });
    const matchedClient = await prisma.client.create({
      data: {
        workspaceId: workspaceA.id,
        name: "QA Match",
        phone: "+54 9 11 0000-0001",
        phoneNormalized: "5491100000001",
      },
    });
    await prisma.client.create({
      data: {
        workspaceId: workspaceB.id,
        name: "QA Other Workspace",
        phone: "+54 9 11 0000-0001",
        phoneNormalized: "5491100000001",
      },
    });

    const statusId = `qa-status-${suffix}`;
    await processWhatsAppWebhookPayload(statusPayload({ wabaId: wabaA, phoneNumberId: phoneA, providerMessageId: statusId, status: "sent", timestamp: "1700000001" }));
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: statusId } })).status, WHATSAPP_MESSAGE_STATUS.SENT);
    pass("G");

    await processWhatsAppWebhookPayload(statusPayload({ wabaId: wabaA, phoneNumberId: phoneA, providerMessageId: statusId, status: "delivered", timestamp: "1700000002" }));
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: statusId } })).status, WHATSAPP_MESSAGE_STATUS.DELIVERED);
    pass("H");

    await processWhatsAppWebhookPayload(statusPayload({ wabaId: wabaA, phoneNumberId: phoneA, providerMessageId: statusId, status: "read", timestamp: "1700000003" }));
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: statusId } })).status, WHATSAPP_MESSAGE_STATUS.READ);
    pass("I");

    const failedId = `qa-failed-${suffix}`;
    await processWhatsAppWebhookPayload(statusPayload({ wabaId: wabaA, phoneNumberId: phoneA, providerMessageId: failedId, status: "failed", timestamp: "1700000004", error: { code: 131000, title: "Safe QA failure" } }));
    const failed = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: failedId } });
    assert.equal(failed.status, WHATSAPP_MESSAGE_STATUS.FAILED);
    assert.equal(failed.failureCode, "131000");
    pass("J");

    await processWhatsAppWebhookPayload(statusPayload({ wabaId: wabaA, phoneNumberId: phoneA, providerMessageId: statusId, status: "delivered", timestamp: "1700000005" }));
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: statusId } })).status, WHATSAPP_MESSAGE_STATUS.READ);
    pass("K");

    const duplicatePayload = statusPayload({ wabaId: wabaA, phoneNumberId: phoneA, providerMessageId: statusId, status: "sent", timestamp: "1700000001" });
    await processWhatsAppWebhookPayload(duplicatePayload);
    assert.equal(await prisma.whatsAppWebhookEvent.count({ where: { eventKey: `status:${statusId}:SENT:1700000001` } }), 1);
    pass("L");

    const inboundId = `qa-inbound-${suffix}`;
    const inboundPayload = {
      object: "whatsapp_business_account",
      entry: [{ id: wabaA, changes: [messageChange({ phoneNumberId: phoneA, providerMessageId: inboundId, from: "541100000001", body: "Texto QA" })] }],
    };
    await processWhatsAppWebhookPayload(inboundPayload);
    const inbound = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: inboundId } });
    assert.equal(inbound.textBody, "Texto QA");
    assert.equal(inbound.direction, "INBOUND");
    pass("M");

    await processWhatsAppWebhookPayload(inboundPayload);
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: inboundId } }), 1);
    pass("N");

    const unsupportedId = `qa-image-${suffix}`;
    await processWhatsAppWebhookPayload({
      object: "whatsapp_business_account",
      entry: [{ id: wabaA, changes: [messageChange({ phoneNumberId: phoneA, providerMessageId: unsupportedId, from: "541100000002", type: "image" })] }],
    });
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: unsupportedId } })).type, "UNSUPPORTED");
    pass("O");

    const multiA = `qa-multi-a-${suffix}`;
    const multiB = `qa-multi-b-${suffix}`;
    await processWhatsAppWebhookPayload({
      object: "whatsapp_business_account",
      entry: [
        { id: wabaA, changes: [messageChange({ phoneNumberId: phoneA, providerMessageId: multiA, from: "541100000003" })] },
        { id: wabaA, changes: [messageChange({ phoneNumberId: phoneA, providerMessageId: multiB, from: "541100000004" })] },
      ],
    });
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: { in: [multiA, multiB] } } }), 2);
    pass("P");

    assert.equal(inbound.workspaceId, workspaceA.id);
    assert.equal(inbound.connectionId, connection.id);
    pass("Q");

    const unknownId = `qa-unknown-connection-${suffix}`;
    await processWhatsAppWebhookPayload({
      object: "whatsapp_business_account",
      entry: [{ id: wabaB, changes: [messageChange({ phoneNumberId: phoneUnknown, providerMessageId: unknownId, from: "541100000005" })] }],
    });
    assert.equal(await prisma.whatsAppMessage.count({ where: { providerMessageId: unknownId } }), 0);
    const unknownEvent = await prisma.whatsAppWebhookEvent.findUniqueOrThrow({ where: { eventKey: `message:${unknownId}` } });
    assert.equal(unknownEvent.workspaceId, null);
    pass("R");

    assert.equal(inbound.clientId, matchedClient.id);
    pass("S");

    const unmatchedId = `qa-unmatched-${suffix}`;
    await processWhatsAppWebhookPayload({
      object: "whatsapp_business_account",
      entry: [{ id: wabaA, changes: [messageChange({ phoneNumberId: phoneA, providerMessageId: unmatchedId, from: "541199999999" })] }],
    });
    assert.equal((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerMessageId: unmatchedId } })).clientId, null);
    pass("T");

    assert.notEqual(inbound.workspaceId, workspaceB.id);
    const crossWorkspaceClient = await prisma.client.findFirstOrThrow({ where: { workspaceId: workspaceB.id } });
    assert.notEqual(inbound.clientId, crossWorkspaceClient.id);
    pass("U");
  } finally {
    await prisma.whatsAppWebhookEvent.deleteMany({ where: { wabaId: { in: [wabaA, wabaB] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
  }
}

async function main() {
  await routeTests();
  if (process.env.WHATSAPP_WEBHOOK_DB_QA === "1") {
    await databaseTests();
    assert.deepEqual([...passed].sort(), "ABCDEFGHIJKLMNOPQRSTUVW".split(""));
    console.log(`WhatsApp webhook QA A-W: ${passed.length}/23 OK`);
  } else {
    assert.deepEqual([...passed].sort(), ["A", "B", "C", "D", "E", "F", "V", "W"]);
    console.log("WhatsApp webhook unit QA: A-F, V-W OK (DB QA disabled)");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
