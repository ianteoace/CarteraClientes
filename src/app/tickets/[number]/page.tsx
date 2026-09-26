import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { TicketDetailControls } from "@/components/tickets/ticket-detail-controls";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { isTicketStatus } from "@/lib/case-types";
import { describeTicketTimeline, ticketActorLabel } from "@/lib/ticket-presentation";
import { getEligibleTicketMembers, getTicket, getTicketTimeline, ticketMemberLabel } from "@/lib/ticket-service";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.TICKET_VIEW)) notFound();
  const parsed = Number((await params).number);
  const ticket = await getTicket(context, parsed);
  if (!ticket || !isTicketStatus(ticket.status)) notFound();
  const canAssign = hasPermission(context, WorkspacePermission.TICKET_ASSIGN);
  const [timeline, members, user] = await Promise.all([
    getTicketTimeline(context, ticket.number),
    canAssign ? getEligibleTicketMembers(context, ticket.contactId) : Promise.resolve([]),
    getCurrentUser(),
  ]);
  const participants = ticket.ticketParticipants.map((participant) => ({
    id: participant.id,
    memberId: participant.memberId,
    label: participant.member ? ticketMemberLabel(participant.member) : `Usuario ${participant.memberUserId.slice(0, 8)}…`,
  }));

  return <main className="app-page max-w-5xl">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/tickets">← Volver a Tickets</Link>
    <header className="mt-7 border-b border-border pb-6"><p className="eyebrow">Ticket #{ticket.number}</p><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-heading">{ticket.title}</h1><p className="page-description">Actualizado {ticket.updatedAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="flex gap-2"><span className="badge-neutral">{TICKET_STATUS_LABELS[ticket.status]}</span><span className={ticket.priority === "URGENT" ? "badge-danger" : ticket.priority === "HIGH" ? "badge-warning" : "badge-neutral"}>{TICKET_PRIORITY_LABELS[ticket.priority as keyof typeof TICKET_PRIORITY_LABELS] ?? "Sin prioridad"}</span></div></div></header>

    <section className="grid gap-6 border-b border-border py-6 sm:grid-cols-2"><div><p className="eyebrow">Contacto</p><Link className="font-semibold hover:underline" href={`/clientes/${ticket.contact!.id}`}>{ticket.contact!.name}</Link><p className="mt-1 text-sm text-muted">{ticket.contact!.phone}</p>{ticket.contact!.email ? <p className="text-sm text-muted">{ticket.contact!.email}</p> : null}</div><div><p className="eyebrow">Responsable</p><p className="font-semibold">{ticket.ticketDetails.assignedMemberId ? ticketMemberLabel(ticket.ticketDetails.assignedMember) : "Sin responsable"}</p><p className="mt-3 text-xs text-muted">Origen: carga manual</p></div></section>

    <TicketDetailControls ticket={{ id: ticket.id, number: ticket.number, title: ticket.title, description: ticket.description, priority: ticket.priority, status: ticket.status, assignedMemberId: ticket.ticketDetails.assignedMemberId, resolution: ticket.ticketDetails.resolution }} members={members} participants={participants} permissions={{ edit: hasPermission(context, WorkspacePermission.TICKET_EDIT), assign: canAssign, resolve: hasPermission(context, WorkspacePermission.TICKET_RESOLVE) }} />

    {!hasPermission(context, WorkspacePermission.TICKET_EDIT) ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Problemática</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{ticket.description ?? "Sin descripción."}</p></section> : null}
    {!hasPermission(context, WorkspacePermission.TICKET_RESOLVE) ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Resolución</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{ticket.ticketDetails.resolution ?? "Sin resolución."}</p></section> : null}

    <section className="mt-8 border-t border-border pt-6"><h2 className="text-lg font-semibold">Notas internas</h2><div className="mt-4 divide-y divide-border border-y border-border">{ticket.ticketNotes.length ? ticket.ticketNotes.map((note) => <article className="py-4" key={note.id}><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{note.authorMember ? ticketMemberLabel(note.authorMember) : note.authorUserId ? `Usuario ${note.authorUserId.slice(0, 8)}…` : "Miembro anterior"}</p><time className="text-xs text-muted">{note.createdAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{note.body}</p></article>) : <p className="py-4 text-sm text-muted">Sin notas internas.</p>}</div></section>

    <section className="mt-8 border-t border-border pt-6"><h2 className="text-lg font-semibold">Timeline</h2><div className="mt-4 divide-y divide-border border-y border-border">{timeline?.map((activity) => <article className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_10rem] sm:gap-5" key={activity.id}><p className="truncate text-sm font-semibold">{ticketActorLabel(activity, user)}</p><p className="text-sm leading-6">{describeTicketTimeline(activity.action, activity.metadata)}</p><time className="text-xs text-muted sm:text-right">{activity.createdAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</time></article>)}</div></section>
  </main>;
}
