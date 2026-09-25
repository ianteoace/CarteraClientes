import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthorizationControl } from "@/components/clients/authorization-control";
import { getCurrentUser } from "@/lib/auth/server";
import { getClientDetails } from "@/lib/client-repository";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { WorkspacePermission } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.CONTACT_VIEW)) notFound();
  const { clientId } = await params; const contact = await getClientDetails(context, clientId); if (!contact) notFound();
  const canEdit = hasPermission(context, WorkspacePermission.CONTACT_EDIT);
  const canManageGroups = hasPermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6"><Link className="text-sm font-medium text-zinc-600" href="/clientes">← Volver a Contactos</Link><section className="rounded-xl border border-zinc-200 bg-white p-6"><div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-semibold">{contact.name}</h1><p className="mt-1 text-zinc-600">Incorporado el {contact.createdAt.toLocaleDateString("es-AR")}</p></div><div className="flex gap-2">{canEdit ? <Link className="rounded-md border px-3 py-2 text-sm" href="/clientes">Editar contacto</Link> : null}{canManageGroups ? <Link className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white" href="/grupos">Administrar grupos</Link> : null}</div></div><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm text-zinc-500">Teléfono</dt><dd className="font-medium">{contact.phone}</dd></div><div><dt className="text-sm text-zinc-500">Empresa</dt><dd className="font-medium">{contact.company ?? "Sin empresa"}</dd></div><div><dt className="text-sm text-zinc-500">Autorización</dt><dd className="mt-1"><AuthorizationControl clientId={contact.id} optIn={contact.optIn} canEdit={canEdit} /></dd></div><div><dt className="text-sm text-zinc-500">Grupos</dt><dd className="flex flex-wrap gap-2 pt-1">{contact.clientGroups.length ? contact.clientGroups.map(({ group }) => <span className="rounded-full bg-zinc-100 px-2 py-1 text-sm" key={group.id}>{group.name}</span>) : "Sin grupos"}</dd></div></dl></section><section className="rounded-xl border border-zinc-200 bg-white p-6"><h2 className="text-lg font-semibold">Notas</h2><p className="mt-3 whitespace-pre-wrap text-zinc-700">{contact.notes ?? "Sin notas"}</p></section></main>;
}
