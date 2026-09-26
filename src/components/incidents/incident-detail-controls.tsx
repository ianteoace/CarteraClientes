"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addIncidentNoteAction,
  addIncidentParticipantsAction,
  assignIncidentAction,
  changeIncidentStatusAction,
  linkTicketsAction,
  removeIncidentParticipantAction,
  unassignIncidentAction,
  unlinkTicketAction,
  updateIncidentAction,
  updateIncidentResolutionAction,
  type IncidentActionResult,
} from "@/app/incidencias/actions";
import { CASE_PRIORITY, INCIDENT_STATUS_TRANSITIONS, type IncidentStatus } from "@/lib/case-types";
import { INCIDENT_PRIORITY_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/incident-labels";

type MemberOption = { id: string; label: string };
type Participant = { id: string; memberId: string | null; label: string };
type TicketOption = { id: string; number: number; title: string; status: string; contact: { name: string } | null };
type LinkedTicket = TicketOption;

export function IncidentDetailControls({ incident, members, participants, availableTickets, linkedTickets, permissions }: {
  incident: { id: string; number: number; title: string; description: string | null; priority: string | null; status: IncidentStatus; assignedMemberId: string | null; resolution: string | null };
  members: MemberOption[];
  participants: Participant[];
  availableTickets: TicketOption[];
  linkedTickets: LinkedTicket[];
  permissions: { edit: boolean; assign: boolean; resolve: boolean; link: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<IncidentActionResult | null>(null);
  const [assigneeId, setAssigneeId] = useState(incident.assignedMemberId ?? "");
  const participantIds = new Set(participants.map(({ memberId }) => memberId).filter(Boolean));
  const addableMembers = members.filter((member) => !participantIds.has(member.id));

  function run(operation: () => Promise<IncidentActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      setNotice(result);
      if (result.success) router.refresh();
    });
  }

  return <div className="space-y-8">
    {notice ? <p className={notice.success ? "notice-success" : "notice-error"} role="status">{notice.success ? notice.message ?? "Cambios guardados." : notice.error}</p> : null}
    {permissions.edit ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Descripción</h2><form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); run(() => updateIncidentAction(incident.id, incident.number, new FormData(event.currentTarget))); }}><label className="field-label">Título<input className="field mt-1" defaultValue={incident.title} maxLength={200} name="title" required /></label><label className="field-label">Descripción<textarea className="field mt-1 min-h-28" defaultValue={incident.description ?? ""} maxLength={10000} name="description" /></label><label className="field-label max-w-xs">Prioridad<select className="field mt-1" defaultValue={incident.priority ?? CASE_PRIORITY.NORMAL} name="priority">{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{INCIDENT_PRIORITY_LABELS[priority]}</option>)}</select></label><div><button className="btn-secondary" disabled={pending} type="submit">Guardar incidencia</button></div></form></section> : null}
    {permissions.resolve ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Estado y resolución</h2><form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => changeIncidentStatusAction(incident.id, incident.number, String(data.get("status") ?? ""), String(data.get("resolution") ?? ""))); }}><label className="field-label max-w-sm">Cambiar estado<select className="field mt-1" name="status" required defaultValue=""><option value="" disabled>Elegí una transición</option>{INCIDENT_STATUS_TRANSITIONS[incident.status].map((value) => <option value={value} key={value}>{INCIDENT_STATUS_LABELS[value]}</option>)}</select></label><label className="field-label">Resolución<textarea className="field mt-1 min-h-28" defaultValue={incident.resolution ?? ""} maxLength={5000} name="resolution" placeholder="Obligatoria al marcar como resuelta" /></label><div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending} type="submit">Cambiar estado</button><button className="btn-secondary" disabled={pending} type="button" onClick={(event) => { const form = event.currentTarget.form; run(() => updateIncidentResolutionAction(incident.id, incident.number, String(new FormData(form ?? undefined).get("resolution") ?? ""))); }}>Guardar solo resolución</button></div></form></section> : null}
    {permissions.assign ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Responsable y participantes</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="field-label flex-1">Responsable<select className="field mt-1" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Sin responsable</option>{members.map((member) => <option value={member.id} key={member.id}>{member.label}</option>)}</select></label><button className="btn-secondary" disabled={pending} type="button" onClick={() => run(() => assigneeId ? assignIncidentAction(incident.id, incident.number, assigneeId) : unassignIncidentAction(incident.id, incident.number))}>Actualizar</button></div><div className="mt-5 divide-y divide-border border-y border-border">{participants.map((participant) => <div className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm" key={participant.id}><span>{participant.label}</span>{participant.memberId && participant.memberId !== incident.assignedMemberId ? <button className="btn-quiet" disabled={pending} type="button" onClick={() => run(() => removeIncidentParticipantAction(incident.id, incident.number, participant.memberId!))}>Quitar</button> : incident.assignedMemberId === participant.memberId ? <span className="badge-neutral">Responsable</span> : <span className="text-xs text-muted">Miembro anterior</span>}</div>)}{!participants.length ? <p className="py-3 text-sm text-muted">Sin participantes.</p> : null}</div>{addableMembers.length ? <form className="mt-4" onSubmit={(event) => { event.preventDefault(); run(() => addIncidentParticipantsAction(incident.id, incident.number, new FormData(event.currentTarget).getAll("memberIds").map(String))); }}><fieldset><legend className="text-sm font-semibold">Agregar participantes</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{addableMembers.map((member) => <label className="flex min-h-10 items-center gap-3 text-sm" key={member.id}><input className="h-5 w-5 accent-black" type="checkbox" name="memberIds" value={member.id} />{member.label}</label>)}</div></fieldset><button className="btn-secondary mt-3" disabled={pending} type="submit">Agregar selección</button></form> : null}</section> : null}
    <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Tickets relacionados <span className="text-sm font-normal text-muted">({linkedTickets.length})</span></h2><div className="mt-4 divide-y divide-border border-y border-border">{linkedTickets.map((ticket) => <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={ticket.id}><a className="min-w-0 text-sm hover:underline" href={`/tickets/${ticket.number}`}><strong>#{ticket.number}</strong> · {ticket.contact?.name ?? "Contacto eliminado"} · {ticket.title} · {ticket.status}</a>{permissions.edit ? <button className="btn-quiet" disabled={pending} onClick={() => run(() => unlinkTicketAction(incident.id, incident.number, ticket.id))} type="button">Desvincular</button> : null}</div>)}{!linkedTickets.length ? <p className="py-3 text-sm text-muted">Sin tickets relacionados.</p> : null}</div>{permissions.link ? <form className="mt-4" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); run(() => linkTicketsAction(incident.id, incident.number, new FormData(event.currentTarget).getAll("ticketIds").map(String))); }}><fieldset><legend className="text-sm font-semibold">Vincular tickets visibles</legend><div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto border-y border-border">{availableTickets.map((ticket) => <label className="flex min-h-11 items-center gap-3 py-2 text-sm" key={ticket.id}><input className="h-5 w-5 shrink-0 accent-black" type="checkbox" name="ticketIds" value={ticket.id} /><span><strong>#{ticket.number}</strong> · {ticket.contact?.name ?? "Contacto eliminado"} · {ticket.title} · {ticket.status}</span></label>)}{!availableTickets.length ? <p className="py-3 text-sm text-muted">No hay tickets disponibles con este filtro.</p> : null}</div></fieldset>{availableTickets.length ? <button className="btn-secondary mt-3" disabled={pending} type="submit">Vincular selección</button> : null}</form> : null}</section>
    {permissions.edit ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Nueva nota interna</h2><form className="mt-4" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const body = String(new FormData(form).get("body") ?? ""); run(async () => { const result = await addIncidentNoteAction(incident.id, incident.number, body); if (result.success) form.reset(); return result; }); }}><textarea className="field min-h-28" maxLength={5000} name="body" required placeholder="Contexto interno para el equipo" /><button className="btn-secondary mt-3" disabled={pending} type="submit">Agregar nota</button></form></section> : null}
  </div>;
}
