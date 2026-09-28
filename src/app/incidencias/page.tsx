import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataList } from "@/components/ui/data-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { getAuthorizationContext, hasAllGroups, hasPermission } from "@/lib/authorization";
import { CASE_PRIORITY, INCIDENT_STATUS } from "@/lib/case-types";
import { INCIDENT_PRIORITY_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/incident-labels";
import { getEligibleIncidentMembers, incidentMemberLabel, listIncidents } from "@/lib/incident-service";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

function queryHref(values: Record<string, string | undefined>, page?: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  if (page && page > 1) query.set("pagina", String(page));
  return `/incidencias${query.size ? `?${query}` : ""}`;
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INCIDENTS) || !hasPermission(context, WorkspacePermission.INCIDENT_VIEW) || !hasAllGroups(context)) notFound();
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

  return <main className="app-page module-page">
    <PageHeader eyebrow="Operación" title="Incidencias" metadata={result.total + " " + (result.total === 1 ? "incidencia" : "incidencias")} actions={hasPermission(context, WorkspacePermission.INCIDENT_CREATE) ? <Link className="btn-primary" href="/incidencias/nueva">Nueva incidencia</Link> : null} />
    <form className="module-toolbar" method="get">
      <input className="field" defaultValue={filters.query} name="q" aria-label="Buscar incidencias" placeholder="Número o título" type="search" />
      <select className="field" defaultValue={filters.status ?? ""} name="estado" aria-label="Estado"><option value="">Todos los estados</option>{Object.values(INCIDENT_STATUS).map((status) => <option value={status} key={status}>{INCIDENT_STATUS_LABELS[status]}</option>)}</select>
      <select className="field" defaultValue={filters.priority ?? ""} name="prioridad" aria-label="Prioridad"><option value="">Todas las prioridades</option>{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{INCIDENT_PRIORITY_LABELS[priority]}</option>)}</select>
      <select className="field" defaultValue={filters.assignedMemberId ?? ""} name="responsable" aria-label="Responsable"><option value="">Todos los responsables</option><option value="unassigned">Sin responsable</option>{assignees.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}</select>
      <button className="btn-secondary" type="submit">Filtrar</button>
    </form>
    {result.items.length ? <DataList columns="incidents" label="Incidencias" headers={["#","Título","Estado","Prioridad","Responsable","Tickets","Actualizada"]}>

      {result.items.map((incident) => <Link className="data-row" href={`/incidencias/${incident.number}`} key={incident.id}>
        <span className="text-sm font-bold">#{incident.number}</span><span className="min-w-0 truncate font-semibold">{incident.title}</span><StatusBadge status={incident.status}>{INCIDENT_STATUS_LABELS[incident.status as keyof typeof INCIDENT_STATUS_LABELS] ?? incident.status}</StatusBadge><StatusBadge status={incident.priority ?? ""}>{INCIDENT_PRIORITY_LABELS[incident.priority as keyof typeof INCIDENT_PRIORITY_LABELS] ?? "—"}</StatusBadge><span className="truncate text-sm text-muted">{incident.incidentDetails?.assignedMemberId ? incidentMemberLabel(incident.incidentDetails.assignedMember) : "Sin responsable"}</span><span className="text-sm text-muted">{incident._count.incidentTicketLinks}</span><time className="text-xs text-muted">{incident.updatedAt.toLocaleDateString("es-AR")}</time>
      </Link>)}
    </DataList> : <div className="empty-state mt-7"><p>Todavía no hay incidencias.</p><p className="mt-1">Creá una incidencia para registrar un problema operativo general.</p>{hasPermission(context, WorkspacePermission.INCIDENT_CREATE) ? <Link className="btn-primary mt-4" href="/incidencias/nueva">Nueva incidencia</Link> : null}</div>}
    {result.pageCount > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación">{result.page > 1 ? <Link className="btn-secondary" href={queryHref(filters, result.page - 1)}>Anterior</Link> : <span />}<span className="text-muted">Página {result.page} de {result.pageCount}</span>{result.page < result.pageCount ? <Link className="btn-secondary" href={queryHref(filters, result.page + 1)}>Siguiente</Link> : <span />}</nav> : null}
  </main>;
}
