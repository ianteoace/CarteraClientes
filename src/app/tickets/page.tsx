import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { CASE_PRIORITY, TICKET_STATUS } from "@/lib/case-types";
import { listTickets, ticketMemberLabel } from "@/lib/ticket-service";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

function queryHref(values: Record<string, string | undefined>, page?: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  if (page && page > 1) query.set("pagina", String(page));
  return `/tickets${query.size ? `?${query}` : ""}`;
}

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS) || !hasPermission(context, WorkspacePermission.TICKET_VIEW)) notFound();
  const query = await searchParams;
  const filters = {
    query: typeof query.q === "string" ? query.q : undefined,
    status: typeof query.estado === "string" ? query.estado : undefined,
    priority: typeof query.prioridad === "string" ? query.prioridad : undefined,
    assignedMemberId: typeof query.responsable === "string" ? query.responsable : undefined,
    contactId: typeof query.contactId === "string" ? query.contactId : undefined,
  };
  const result = await listTickets(context, { ...filters, page: typeof query.pagina === "string" ? Number(query.pagina) : 1 });
  const assignees = new Map<string, string>();
  for (const ticket of result.items) if (ticket.ticketDetails?.assignedMember) assignees.set(ticket.ticketDetails.assignedMember.id, ticketMemberLabel(ticket.ticketDetails.assignedMember));

  return <main className="app-page">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Operación</p><h1 className="page-heading">Tickets</h1><p className="page-description">{result.total} {result.total === 1 ? "ticket" : "tickets"}</p></div>{hasPermission(context, WorkspacePermission.TICKET_CREATE) ? <Link className="btn-primary" href="/tickets/nuevo">Nuevo ticket</Link> : null}</div>

    <form className="mt-7 grid gap-2 border-y border-border py-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,auto))_auto]" method="get">
      {filters.contactId ? <input name="contactId" type="hidden" value={filters.contactId} /> : null}
      <input className="field" defaultValue={filters.query} name="q" placeholder="Número, título, contacto, teléfono o email" type="search" />
      <select className="field" defaultValue={filters.status ?? ""} name="estado"><option value="">Todos los estados</option>{Object.values(TICKET_STATUS).map((status) => <option value={status} key={status}>{TICKET_STATUS_LABELS[status]}</option>)}</select>
      <select className="field" defaultValue={filters.priority ?? ""} name="prioridad"><option value="">Todas las prioridades</option>{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{TICKET_PRIORITY_LABELS[priority]}</option>)}</select>
      <select className="field" defaultValue={filters.assignedMemberId ?? ""} name="responsable"><option value="">Todos los responsables</option><option value="unassigned">Sin responsable</option>{[...assignees].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
      <button className="btn-secondary" type="submit">Filtrar</button>
    </form>

    {result.items.length ? <div className="divide-y divide-border border-b border-border">
      <div className="hidden grid-cols-[5rem_minmax(12rem,1.6fr)_minmax(10rem,1fr)_8rem_7rem_minmax(10rem,1fr)_9rem] gap-4 bg-surface px-3 py-2 text-xs font-semibold text-muted lg:grid"><span>Número</span><span>Título</span><span>Contacto</span><span>Estado</span><span>Prioridad</span><span>Responsable</span><span>Actualizado</span></div>
      {result.items.map((ticket) => <Link className="grid gap-2 px-3 py-4 transition hover:bg-surface lg:grid-cols-[5rem_minmax(12rem,1.6fr)_minmax(10rem,1fr)_8rem_7rem_minmax(10rem,1fr)_9rem] lg:items-center lg:gap-4" href={`/tickets/${ticket.number}`} key={ticket.id}>
        <span className="text-sm font-bold">#{ticket.number}</span><span className="min-w-0 truncate font-semibold">{ticket.title}</span><span className="min-w-0 truncate text-sm text-muted">{ticket.contact?.name ?? "Contacto eliminado"}</span><span className="text-sm">{TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status}</span><span className="text-sm">{TICKET_PRIORITY_LABELS[ticket.priority as keyof typeof TICKET_PRIORITY_LABELS] ?? "—"}</span><span className="truncate text-sm text-muted">{ticket.ticketDetails?.assignedMemberId ? ticketMemberLabel(ticket.ticketDetails.assignedMember) : "Sin responsable"}</span><time className="text-xs text-muted">{ticket.updatedAt.toLocaleDateString("es-AR")}</time>
      </Link>)}
    </div> : <div className="empty-state mt-7"><p>Todavía no hay tickets.</p><p className="mt-1">Creá un ticket para registrar una problemática o solicitud de un contacto.</p>{hasPermission(context, WorkspacePermission.TICKET_CREATE) ? <Link className="btn-primary mt-4" href="/tickets/nuevo">Nuevo ticket</Link> : null}</div>}

    {result.pageCount > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación">{result.page > 1 ? <Link className="btn-secondary" href={queryHref(filters, result.page - 1)}>Anterior</Link> : <span />}<span className="text-muted">Página {result.page} de {result.pageCount}</span>{result.page < result.pageCount ? <Link className="btn-secondary" href={queryHref(filters, result.page + 1)}>Siguiente</Link> : <span />}</nav> : null}
  </main>;
}
