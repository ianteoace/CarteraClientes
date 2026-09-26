import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { ACTIVITY_FILTERS, type ActivityFilter } from "@/lib/activity-types";
import { activityEntityLabel, describeActivity } from "@/lib/activity-presentation";
import { listWorkspaceActivity, normalizeActivityFilter } from "@/lib/activity-repository";

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: "Todos", contactos: "Contactos", grupos: "Grupos", campanas: "Campañas",
  equipo: "Equipo", invitaciones: "Invitaciones", configuracion: "Configuración",
  tickets: "Tickets",
  incidencias: "Incidencias",
};

function pageHref(filter: ActivityFilter, page?: number) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("tipo", filter);
  if (page && page > 1) query.set("pagina", String(page));
  const value = query.toString();
  return `/actividad${value ? `?${value}` : ""}`;
}

export default async function ActivityPage({ searchParams }: PageProps<"/actividad">) {
  const context = await getAuthorizationContext();
  const user = await getCurrentUser();
  const query = await searchParams;
  const filter = normalizeActivityFilter(typeof query.tipo === "string" ? query.tipo : undefined);
  const requestedPage = typeof query.pagina === "string" ? Number(query.pagina) : 1;
  const result = await listWorkspaceActivity(context, filter, requestedPage);

  return <main className="app-page">
    <p className="eyebrow">Auditoría</p>
    <h1 className="page-heading">Actividad</h1>
    <p className="page-description">Acciones relevantes realizadas dentro de esta cartera.</p>
    <nav aria-label="Filtrar actividad" className="mt-7 flex flex-wrap gap-2 border-b border-border pb-4">
      {(Object.keys(ACTIVITY_FILTERS) as ActivityFilter[]).map((key) => <Link className={key === filter ? "btn-primary" : "btn-secondary"} href={pageHref(key)} key={key}>{FILTER_LABELS[key]}</Link>)}
    </nav>
    {result.items.length ? <div className="divide-y divide-border border-b border-border">
      {result.items.map((activity) => {
        const actor = activity.actorUserId === user?.id ? (user.name?.trim() || user.email) : activity.actorMember?.acceptedInvitations[0]?.email || (activity.actorUserId ? `Usuario ${activity.actorUserId.slice(0, 8)}…` : "Sistema");
        return <article className="grid gap-1 py-4 sm:grid-cols-[minmax(9rem,0.35fr)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-5" key={activity.id}>
          <p className="truncate text-sm font-semibold">{actor}</p>
          <div className="min-w-0"><p className="text-sm leading-6">{describeActivity(activity.action, activity.metadata)}</p><p className="mt-0.5 text-xs text-muted">{activityEntityLabel(activity.entityType, activity.metadata)}</p></div>
          <time className="text-xs text-muted" dateTime={activity.createdAt.toISOString()}>{activity.createdAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</time>
        </article>;
      })}
    </div> : <p className="empty-state mt-7">Todavía no hay actividad para este filtro.</p>}
    {result.pageCount > 1 ? <nav aria-label="Paginación" className="mt-5 flex items-center justify-between text-sm">
      {result.page > 1 ? <Link className="btn-secondary" href={pageHref(filter, result.page - 1)}>Anterior</Link> : <span />}
      <span className="text-muted">Página {result.page} de {result.pageCount}</span>
      {result.page < result.pageCount ? <Link className="btn-secondary" href={pageHref(filter, result.page + 1)}>Siguiente</Link> : <span />}
    </nav> : null}
  </main>;
}
