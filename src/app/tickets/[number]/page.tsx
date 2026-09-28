import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { TicketDetailControls } from "@/components/tickets/ticket-detail-controls";
import { CaseOrigin } from "@/components/cases/case-origin";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { isTicketStatus } from "@/lib/case-types";
import { describeTicketTimeline, ticketActorLabel } from "@/lib/ticket-presentation";
import { getEligibleTicketMembers, getTicket, getTicketTimeline, ticketMemberLabel } from "@/lib/ticket-service";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { getRelatedIncidentsForTicket } from "@/lib/incident-service";
import { INCIDENT_STATUS_LABELS } from "@/lib/incident-labels";
import { getCaseOrigin } from "@/lib/case-conversation-repository";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS) || !hasPermission(context, WorkspacePermission.TICKET_VIEW)) notFound();
  const parsed = Number((await params).number);
  const ticket = await getTicket(context, parsed);
  if (!ticket || !isTicketStatus(ticket.status)) notFound();
  const canAssign = hasPermission(context, WorkspacePermission.TICKET_ASSIGN);
  const canViewIncidents = isModuleEnabled(modules, WORKSPACE_MODULE.INCIDENTS) && hasPermission(context, WorkspacePermission.INCIDENT_VIEW);
  const canViewInbox = isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) && hasPermission(context, WorkspacePermission.INBOX_VIEW);
  const [timeline, members, user, relatedIncidents, origins] = await Promise.all([
    getTicketTimeline(context, ticket.number),
    canAssign ? getEligibleTicketMembers(context, ticket.contactId) : Promise.resolve([]),
    getCurrentUser(),
    canViewIncidents ? getRelatedIncidentsForTicket(context, ticket.id) : Promise.resolve([]),
    canViewInbox ? getCaseOrigin(context, ticket.id) : Promise.resolve([]),
  ]);
  const participants = ticket.ticketParticipants.map((participant) => ({
    id: participant.id,
    memberId: participant.memberId,
    label: participant.member ? ticketMemberLabel(participant.member) : `Usuario ${participant.memberUserId.slice(0, 8)}…`,
  }));

  return <main className="app-page module-page">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/tickets">← Volver a Tickets</Link>
    <div className="mt-5"><PageHeader eyebrow={`Ticket #${ticket.number}`} title={ticket.title} metadata={`Actualizado ${ticket.updatedAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}`} actions={<StatusBadge status={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</StatusBadge>} /></div>
    <div className="document-layout"><div className="document-main">





    <TicketDetailControls ticket={{ id: ticket.id, number: ticket.number, title: ticket.title, description: ticket.description, priority: ticket.priority, status: ticket.status, assignedMemberId: ticket.ticketDetails.assignedMemberId, resolution: ticket.ticketDetails.resolution }} members={members} participants={participants} permissions={{ edit: hasPermission(context, WorkspacePermission.TICKET_EDIT), assign: canAssign, resolve: hasPermission(context, WorkspacePermission.TICKET_RESOLVE) }} />

    <section className="border-t border-border pt-6"><SectionHeader title="Problemática" /><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{ticket.description ?? "Sin descripción."}</p></section>
    <section className="border-t border-border pt-6"><SectionHeader title="Resolución" /><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{ticket.ticketDetails.resolution ?? "Sin resolución."}</p></section>

    {relatedIncidents.length ? <section className="mt-8 border-t border-border pt-6"><SectionHeader title="Incidencias relacionadas" /><div className="mt-4 divide-y divide-border border-y border-border">{relatedIncidents.map((incident) => <Link className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:underline" href={`/incidencias/${incident.number}`} key={incident.id}><span><strong>#{incident.number}</strong> {incident.title}</span><span className="text-muted">{INCIDENT_STATUS_LABELS[incident.status as keyof typeof INCIDENT_STATUS_LABELS] ?? incident.status}</span></Link>)}</div></section> : null}
    <CaseOrigin origins={origins} />

    <section className="mt-8 border-t border-border pt-6"><SectionHeader title="Notas internas" /><div className="editorial-notes mt-4 divide-y divide-border">{ticket.ticketNotes.length ? ticket.ticketNotes.map((note) => <article className="py-4" key={note.id}><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{note.authorMember ? ticketMemberLabel(note.authorMember) : note.authorUserId ? `Usuario ${note.authorUserId.slice(0, 8)}…` : "Miembro anterior"}</p><time className="text-xs text-muted">{note.createdAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{note.body}</p></article>) : <p className="py-4 text-sm text-muted">Sin notas internas.</p>}</div></section>

    <section className="mt-8 border-t border-border pt-6"><SectionHeader title="Timeline" /><div className="editorial-timeline mt-4">{timeline?.map((activity) => <article className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_10rem] sm:gap-5" key={activity.id}><p className="truncate text-sm font-semibold">{ticketActorLabel(activity, user)}</p><p className="text-sm leading-6">{describeTicketTimeline(activity.action, activity.metadata)}</p><time className="text-xs text-muted sm:text-right">{activity.createdAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</time></article>)}</div></section>
    </div><aside className="document-aside" aria-label="Información contextual"><SectionHeader title="Información" /><dl className="context-section"><dt>Contacto</dt><dd><Link href={`/clientes/${ticket.contact!.id}`} className="hover:underline">{ticket.contact!.name}</Link></dd><dd className="text-xs text-muted">{ticket.contact!.phone}</dd><dt>Responsable</dt><dd>{ticket.ticketDetails.assignedMemberId ? ticketMemberLabel(ticket.ticketDetails.assignedMember) : "Sin responsable"}</dd><dt>Prioridad</dt><dd><StatusBadge status={ticket.priority ?? ""}>{TICKET_PRIORITY_LABELS[ticket.priority as keyof typeof TICKET_PRIORITY_LABELS] ?? "Sin prioridad"}</StatusBadge></dd><dt>Estado</dt><dd><StatusBadge status={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</StatusBadge></dd><dt>Participantes</dt><dd>{participants.length ? participants.map((participant) => <p className="py-1" key={participant.id}>{participant.label}</p>) : "Sin participantes"}</dd>{ticket.contact!.email ? <><dt>Email</dt><dd>{ticket.contact!.email}</dd></> : null}</dl><div className="context-section"><SectionHeader title="Origen" />{origins.length ? origins.map((origin) => <Link className="mt-3 block text-xs underline underline-offset-4" key={origin.id} href={`/bandeja/${origin.conversation.id}`}>WhatsApp · Abrir conversación</Link>) : <p className="mt-3 text-xs text-muted">Carga manual</p>}</div></aside></div>
  </main>;
}
