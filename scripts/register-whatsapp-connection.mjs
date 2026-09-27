import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspaceId = process.argv[2]?.trim();
  const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const displayPhoneNumber = process.env.WHATSAPP_DISPLAY_PHONE_NUMBER?.trim() || null;

  if (!workspaceId) throw new Error("Indicá el workspaceId explícitamente como primer argumento.");
  if (!wabaId || !phoneNumberId) {
    throw new Error("Faltan WHATSAPP_WABA_ID o WHATSAPP_PHONE_NUMBER_ID.");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) throw new Error("El Workspace indicado no existe.");

  const existing = await prisma.whatsAppConnection.findUnique({
    where: { phoneNumberId },
    select: { id: true, workspaceId: true },
  });
  if (existing && existing.workspaceId !== workspace.id) {
    throw new Error("El Phone Number ID ya pertenece a otro Workspace.");
  }

  const connection = await prisma.whatsAppConnection.upsert({
    where: { phoneNumberId },
    create: {
      workspaceId: workspace.id,
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
      status: "ACTIVE",
    },
    update: { wabaId, displayPhoneNumber, status: "ACTIVE" },
    select: { id: true, workspaceId: true, status: true },
  });

  console.log(JSON.stringify({
    registered: true,
    connectionId: connection.id,
    workspaceId: connection.workspaceId,
    workspaceName: workspace.name,
    status: connection.status,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "No se pudo registrar la conexión.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
