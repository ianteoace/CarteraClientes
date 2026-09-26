import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { getAuthorizationContext, hasAllGroups, hasPermission } from "@/lib/authorization";
import { CASE_PRIORITY, INCIDENT_STATUS } from "@/lib/case-types";
import { INCIDENT_PRIORITY_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/incident-labels";
import { getEligibleIncidentMembers, incidentMemberLabel, listIncidents } from "@/lib/incident-service";

export const dynamic = "force-dynamic";

function queryHref(values: Record<string, string | undefined>, page?: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  if (page && page > 1) query.set("pagina", String(page));
  return `/incidencias${query.size ? `?${query}` : ""}`;
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.INCIDENT_VIEW) || !hasAllGroups(context)) notFound();
  const query = await searchParams;
  const filters = {
    query: typeof query.q === "string" ? query.q : undefined,
    status: typeof query.estado === "string" ? query.estado : undefined,
    priority: typeof query.prioridad === "string" ? query.prioridad : undefined,
    assignedMemberId: typeof query.responsable === "string" ? query.responsable : undefined,
  };
  const [result, assignees] = await Promise.all([
    listIncidents(context, { ...filters, page: typeof query.pagina === "string" ? Number(query.pagina) : 1 }),
    getEligibleIncidentMembers(context),
  ]);

  return <main className="app-page">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Operación</p><h1 className="page-heading">Incidencias</h1><p className="page-description">{result.total} {result.total === 1 ? "incidencia" : "incidencias"}</p></div>{hasPermission(context, WorkspacePermission.INCIDENT_CREATE) ? <Link className="btn-primary" href="/incidencias/nueva">Nueva incidencia</Link> : null}</div>
    <form className="mt-7 grid gap-2 border-y border-border py-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,auto))_auto]" method="get">
      <input className="field" defaultValue={filters.query} name="q" placeholder="Número o título" type="search" />
      <select className="field" defaultValue={filters.status ?? ""} name="estado"><option value="">Todos los estados</option>{Object.values(INCIDENT_STATUS).map((status) => <option value={status} key={status}>{INCIDENT_STATUS_LABELS[status]}</option>)}</select>
      <select className="field" defaultValue={filters.priority ?? ""} name="prioridad"><option value="">Todas las prioridades</option>{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{INCIDENT_PRIORITY_LABELS[priority]}</option>)}</select>
      <select className="field" defaultValue={filters.assignedMemberId ?? ""} name="responsable"><option value="">Todos los responsables</option><option value="unassigned">Sin responsable</option>{assignees.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}</select>
      <button className="btn-secondary" type="submit">Filtrar</button>
    </form>
    {result.items.length ? <div className="divide-y divide-border border-b border-border">
      <div className="hidden grid-cols-[5rem_minmax(12rem,1.6fr)_8rem_7rem_minmax(10rem,1fr)_8rem_9rem] gap-4 bg-surface px-3 py-2 text-xs font-semibold text-muted lg:grid"><span>Número</span><span>Título</span><span>Estado</span><span>Prioridad</span><span>Responsable</span><span>Tickets</span><span>Actualizada</span></div>
      {result.items.map((incident) => <Link className="grid gap-2 px-3 py-4 transition hover:bg-surface lg:grid-cols-[5rem_minmax(12rem,1.6fr)_8rem_7rem_minmax(10rem,1fr)_8rem_9rem] lg:items-center lg:gap-4" href={`/incidencias/${incident.number}`} key={incident.id}>
        <span className="text-sm font-bold">#{incident.number}</span><span className="min-w-0 truncate font-semibold">{incident.title}</span><span className="text-sm">{INCIDENT_STATUS_LABELS[incident.status as keyof typeof INCIDENT_STATUS_LABELS] ?? incident.status}</span><span className="text-sm">{INCIDENT_PRIORITY_LABELS[incident.priority as keyof typeof INCIDENT_PRIORITY_LABELS] ?? "—"}</span><span className="truncate text-sm text-muted">{incident.incidentDetails?.assignedMemberId ? incidentMemberLabel(incident.incidentDetails.assignedMember) : "Sin responsable"}</span><span className="text-sm text-muted">{incident._count.incidentTicketLinks}</span><time className="text-xs text-muted">{incident.updatedAt.toLocaleDateString("es-AR")}</time>
      </Link>)}
    </div> : <div className="empty-state mt-7"><p>Todavía no hay incidencias.</p><p className="mt-1">Creá una incidencia para registrar un problema operativo general.</p>{hasPermission(context, WorkspacePermission.INCIDENT_CREATE) ? <Link className="btn-primary mt-4" href="/incidencias/nueva">Nueva incidencia</Link> : null}</div>}
    {result.pageCount > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación">{result.page > 1 ? <Link className="btn-secondary" href={queryHref(filters, result.page - 1)}>Anterior</Link> : <span />}<span className="text-muted">Página {result.page} de {result.pageCount}</span>{result.page < result.pageCount ? <Link className="btn-secondary" href={queryHref(filters, result.page + 1)}>Siguiente</Link> : <span />}</nav> : null}
  </main>;
}
