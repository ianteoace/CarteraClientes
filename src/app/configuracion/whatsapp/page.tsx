import Link from "next/link";
import { WorkspacePermission } from "@prisma/client";
import { notFound } from "next/navigation";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function WhatsAppConfigurationPage() {
  if (!hasPermission(await getAuthorizationContext(), WorkspacePermission.WORKSPACE_SETTINGS_VIEW)) notFound();
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6"><Link className="text-sm font-medium text-zinc-600" href="/configuracion">← Volver a Configuración</Link><section className="rounded-xl border border-zinc-200 bg-white p-6"><p className="text-sm font-medium text-zinc-500">WhatsApp</p><h1 className="mt-1 text-3xl font-semibold">Todavía no está conectado</h1><p className="mt-3 max-w-xl text-zinc-600">Las campañas de esta cartera funcionan en modo simulación. No se envían mensajes reales ni se necesitan credenciales en esta etapa.</p><div className="mt-6 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700"><strong>Próximamente:</strong> vas a poder conectar el número de WhatsApp que quieras usar con esta cartera.</div></section></main>;
}
