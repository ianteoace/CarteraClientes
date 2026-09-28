import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
async function main() {
  const workspaceId = process.argv[2]?.trim();
  const address = process.argv[3]?.trim().toLowerCase();
  const displayName = process.argv[4]?.trim().slice(0, 255) || null;
  if (!workspaceId || !address || address.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new Error("Indicá workspaceId y una dirección real configurada en Resend. Nombre visible opcional.");
  }
  const connection = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-register:${address}`}, 0))`;
    const workspace = await transaction.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) throw new Error("El Workspace indicado no existe.");
    const existing = await transaction.emailConnection.findUnique({ where: { provider_address: { provider: "RESEND", address } }, select: { workspaceId: true } });
    if (existing && existing.workspaceId !== workspaceId) throw new Error("La dirección ya pertenece a otra cartera.");
    return transaction.emailConnection.upsert({ where: { provider_address: { provider: "RESEND", address } },
      create: { workspaceId, provider: "RESEND", address, displayName, status: "ACTIVE" },
      update: { displayName, status: "ACTIVE" }, select: { id: true, status: true },
    });
  });
  console.log(JSON.stringify({ registered: true, ...connection }));
}
main().catch(() => { console.error("No se pudo registrar la conexión. Revisá workspace, dirección y permisos de base de datos."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
