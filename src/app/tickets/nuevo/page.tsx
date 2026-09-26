import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

import { TicketForm } from "@/components/tickets/ticket-form";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getTicketFormOptions } from "@/lib/ticket-service";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ contactId?: string | string[] }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS) || !hasPermission(context, WorkspacePermission.TICKET_CREATE)) notFound();
  const [query, options] = await Promise.all([searchParams, getTicketFormOptions(context)]);
  const requestedContactId = typeof query.contactId === "string" ? query.contactId : undefined;
  const initialContactId = options.contacts.some(({ id }) => id === requestedContactId) ? requestedContactId : undefined;
  return <main className="app-page"><Link className="text-sm font-semibold text-muted hover:text-foreground" href="/tickets">← Volver a Tickets</Link><p className="eyebrow mt-7">Registro manual</p><h1 className="page-heading">Nuevo ticket</h1><p className="page-description">Registrá una problemática o solicitud de un contacto visible en tu alcance.</p>{options.contacts.length ? <TicketForm contacts={options.contacts} members={options.members} initialContactId={initialContactId} /> : <p className="empty-state mt-7">No hay contactos visibles para crear un ticket.</p>}</main>;
}
