import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { IncidentDetailControls } from "@/components/incidents/incident-detail-controls";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasAllGroups, hasPermission } from "@/lib/authorization";
import { isIncidentStatus } from "@/lib/case-types";
import { INCIDENT_PRIORITY_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/incident-labels";
import { describeIncidentTimeline, incidentActorLabel } from "@/lib/incident-presentation";
import { getAvailableIncidentTickets, getEligibleIncidentMembers, getIncident, getIncidentTimeline, incidentMemberLabel } from "@/lib/incident-service";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ ticketQ?: string | string[] }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INCIDENTS) || !hasPermission(context, WorkspacePermission.INCIDENT_VIEW) || !hasAllGroups(context)) notFound();
  const parsed = Number((await params).number);
  const incident = await getIncident(context, parsed);
  if (!incident || !isIncidentStatus(incident.status)) notFound();
  const canAssign = hasPermission(context, WorkspacePermission.INCIDENT_ASSIGN);
  const canEdit = hasPermission(context, WorkspacePermission.INCIDENT_EDIT);
  const ticketsEnabled = isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS);
  const canLink = ticketsEnabled && canEdit && hasPermission(context, WorkspacePermission.TICKET_VIEW);
  const query = await searchParams;
  const ticketQuery = typeof query.ticketQ === "string" ? query.ticketQ : "";
  const [timeline, members, availableTickets, user] = await Promise.all([
    getIncidentTimeline(context, incident.number),
    canAssign ? getEligibleIncidentMembers(context) : Promise.resolve([]),
    canLink ? getAvailableIncidentTickets(context, incident.id, ticketQuery) : Promise.resolve([]),
    getCurrentUser(),
  ]);
  const participants = incident.incidentParticipants.map((participant) => ({ id: participant.id, memberId: participant.memberId, label: participant.member ? incidentMemberLabel(participant.member) : `Usuario ${participant.memberUserId.slice(0, 8)}…` }));
  const linkedTickets = ticketsEnabled ? incident.incidentTicketLinks.map(({ ticketCase }) => ({ id: ticketCase.id, number: ticketCase.number, title: ticketCase.title, status: TICKET_STATUS_LABELS[ticketCase.status as keyof typeof TICKET_STATUS_LABELS] ?? ticketCase.status, contact: ticketCase.contact })) : [];

  return <main className="app-page max-w-5xl">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/incidencias">← Volver a Incidencias</Link>
    <header className="mt-7 border-b border-border pb-6"><p className="eyebrow">Incidencia #{incident.number}</p><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-heading">{incident.title}</h1><p className="page-description">Actualizada {incident.updatedAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="flex gap-2"><span className="badge-neutral">{INCIDENT_STATUS_LABELS[incident.status]}</span><span className={incident.priority === "URGENT" ? "badge-danger" : incident.priority === "HIGH" ? "badge-warning" : "badge-neutral"}>{INCIDENT_PRIORITY_LABELS[incident.priority as keyof typeof INCIDENT_PRIORITY_LABELS] ?? "Sin prioridad"}</span></div></div></header>
    <section className="border-b border-border py-6"><p className="eyebrow">Responsable</p><p className="font-semibold">{incident.incidentDetails.assignedMemberId ? incidentMemberLabel(incident.incidentDetails.assignedMember) : "Sin responsable"}</p></section>
    {canLink ? <form className="mt-6 flex flex-col gap-2 border-b border-border pb-5 sm:flex-row" method="get"><input className="field flex-1" defaultValue={ticketQuery} name="ticketQ" placeholder="Buscar ticket disponible por número, título o contacto" type="search" /><button className="btn-secondary" type="submit">Buscar tickets</button></form> : null}
    <IncidentDetailControls incident={{ id: incident.id, number: incident.number, title: incident.title, description: incident.description, priority: incident.priority, status: incident.status, assignedMemberId: incident.incidentDetails.assignedMemberId, resolution: incident.incidentDetails.resolution }} members={members} participants={participants} availableTickets={availableTickets.map((ticket) => ({ ...ticket, status: TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status }))} linkedTickets={linkedTickets} ticketsEnabled={ticketsEnabled} permissions={{ edit: canEdit, assign: canAssign, resolve: hasPermission(context, WorkspacePermission.INCIDENT_RESOLVE), link: canLink }} />
    {!canAssign ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Participantes</h2><div className="mt-3 divide-y divide-border border-y border-border">{participants.length ? participants.map((participant) => <p className="py-3 text-sm" key={participant.id}>{participant.label}</p>) : <p className="py-3 text-sm text-muted">Sin participantes.</p>}</div></section> : null}
    {!canEdit ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Descripción</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{incident.description ?? "Sin descripción."}</p></section> : null}
    {!hasPermission(context, WorkspacePermission.INCIDENT_RESOLVE) ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Resolución</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{incident.incidentDetails.resolution ?? "Sin resolución."}</p></section> : null}
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-lg font-semibold">Notas internas</h2><div className="mt-4 divide-y divide-border border-y border-border">{incident.incidentNotes.length ? incident.incidentNotes.map((note) => <article className="py-4" key={note.id}><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{note.authorMember ? incidentMemberLabel(note.authorMember) : note.authorUserId ? `Usuario ${note.authorUserId.slice(0, 8)}…` : "Miembro anterior"}</p><time className="text-xs text-muted">{note.createdAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{note.body}</p></article>) : <p className="py-4 text-sm text-muted">Sin notas internas.</p>}</div></section>
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-lg font-semibold">Timeline</h2><div className="mt-4 divide-y divide-border border-y border-border">{timeline?.map((activity) => <article className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_10rem] sm:gap-5" key={activity.id}><p className="truncate text-sm font-semibold">{incidentActorLabel(activity, user)}</p><p className="text-sm leading-6">{describeIncidentTimeline(activity.action, activity.metadata)}</p><time className="text-xs text-muted sm:text-right">{activity.createdAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</time></article>)}</div></section>
  </main>;
}
