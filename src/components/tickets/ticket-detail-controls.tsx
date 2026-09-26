"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addTicketNoteAction,
  addTicketParticipantsAction,
  assignTicketAction,
  changeTicketStatusAction,
  removeTicketParticipantAction,
  unassignTicketAction,
  updateTicketAction,
  updateTicketResolutionAction,
  type TicketActionResult,
} from "@/app/tickets/actions";
import { CASE_PRIORITY, TICKET_STATUS_TRANSITIONS, type TicketStatus } from "@/lib/case-types";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

type MemberOption = { id: string; label: string };
type Participant = { id: string; memberId: string | null; label: string };

export function TicketDetailControls({ ticket, members, participants, permissions }: {
  ticket: { id: string; number: number; title: string; description: string | null; priority: string | null; status: TicketStatus; assignedMemberId: string | null; resolution: string | null };
  members: MemberOption[];
  participants: Participant[];
  permissions: { edit: boolean; assign: boolean; resolve: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<TicketActionResult | null>(null);
  const [assigneeId, setAssigneeId] = useState(ticket.assignedMemberId ?? "");
  const participantIds = new Set(participants.map(({ memberId }) => memberId).filter(Boolean));
  const addableMembers = members.filter((member) => !participantIds.has(member.id));

  function run(operation: () => Promise<TicketActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      setNotice(result);
      if (result.success) router.refresh();
    });
  }

  function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateTicketAction(ticket.id, ticket.number, new FormData(event.currentTarget)));
  }

  function status(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(() => changeTicketStatusAction(ticket.id, ticket.number, String(data.get("status") ?? ""), String(data.get("resolution") ?? "")));
  }

  function participantsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => addTicketParticipantsAction(ticket.id, ticket.number, new FormData(event.currentTarget).getAll("memberIds").map(String)));
  }

  return <div className="space-y-8">
    {notice ? <p className={notice.success ? "notice-success" : "notice-error"} role="status">{notice.success ? notice.message ?? "Cambios guardados." : notice.error}</p> : null}

    {permissions.edit ? <section className="border-t border-border pt-6">
      <h2 className="text-lg font-semibold">Problemática</h2>
      <form className="mt-4 grid gap-4" onSubmit={edit}>
        <label className="field-label">Título<input className="field mt-1" defaultValue={ticket.title} maxLength={200} name="title" required /></label>
        <label className="field-label">Descripción<textarea className="field mt-1 min-h-28" defaultValue={ticket.description ?? ""} maxLength={10000} name="description" /></label>
        <label className="field-label max-w-xs">Prioridad<select className="field mt-1" defaultValue={ticket.priority ?? CASE_PRIORITY.NORMAL} name="priority">{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{TICKET_PRIORITY_LABELS[priority]}</option>)}</select></label>
        <div><button className="btn-secondary" disabled={pending} type="submit">Guardar problemática</button></div>
      </form>
    </section> : null}

    {permissions.resolve ? <section className="border-t border-border pt-6">
      <h2 className="text-lg font-semibold">Estado y resolución</h2>
      <form className="mt-4 grid gap-4" onSubmit={status}>
        <label className="field-label max-w-sm">Cambiar estado<select className="field mt-1" name="status" required defaultValue=""><option value="" disabled>Elegí una transición</option>{TICKET_STATUS_TRANSITIONS[ticket.status].map((value) => <option value={value} key={value}>{TICKET_STATUS_LABELS[value]}</option>)}</select></label>
        <label className="field-label">Resolución<textarea className="field mt-1 min-h-28" defaultValue={ticket.resolution ?? ""} maxLength={5000} name="resolution" placeholder="Obligatoria al marcar como resuelto" /></label>
        <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending} type="submit">Cambiar estado</button><button className="btn-secondary" disabled={pending} type="button" onClick={(event) => { const form = event.currentTarget.form; run(() => updateTicketResolutionAction(ticket.id, ticket.number, String(new FormData(form ?? undefined).get("resolution") ?? ""))); }}>Guardar solo resolución</button></div>
      </form>
    </section> : null}

    {permissions.assign ? <section className="border-t border-border pt-6">
      <h2 className="text-lg font-semibold">Responsable y participantes</h2>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="field-label flex-1">Responsable<select className="field mt-1" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Sin responsable</option>{members.map((member) => <option value={member.id} key={member.id}>{member.label}</option>)}</select></label>
        <button className="btn-secondary" disabled={pending} type="button" onClick={() => run(() => assigneeId ? assignTicketAction(ticket.id, ticket.number, assigneeId) : unassignTicketAction(ticket.id, ticket.number))}>Actualizar</button>
      </div>
      <div className="mt-5 divide-y divide-border border-y border-border">
        {participants.map((participant) => <div className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm" key={participant.id}><span>{participant.label}</span>{participant.memberId && participant.memberId !== ticket.assignedMemberId ? <button className="btn-quiet" disabled={pending} type="button" onClick={() => run(() => removeTicketParticipantAction(ticket.id, ticket.number, participant.memberId!))}>Quitar</button> : ticket.assignedMemberId === participant.memberId ? <span className="badge-neutral">Responsable</span> : <span className="text-xs text-muted">Miembro anterior</span>}</div>)}
        {!participants.length ? <p className="py-3 text-sm text-muted">Sin participantes.</p> : null}
      </div>
      {addableMembers.length ? <form className="mt-4" onSubmit={participantsSubmit}><fieldset><legend className="text-sm font-semibold">Agregar participantes</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{addableMembers.map((member) => <label className="flex min-h-10 items-center gap-3 text-sm" key={member.id}><input className="h-5 w-5 accent-black" type="checkbox" name="memberIds" value={member.id} />{member.label}</label>)}</div></fieldset><button className="btn-secondary mt-3" disabled={pending} type="submit">Agregar selección</button></form> : null}
    </section> : null}

    {permissions.edit ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Nueva nota interna</h2><form className="mt-4" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const body = String(new FormData(form).get("body") ?? ""); run(async () => { const result = await addTicketNoteAction(ticket.id, ticket.number, body); if (result.success) form.reset(); return result; }); }}><textarea className="field min-h-28" maxLength={5000} name="body" required placeholder="Contexto interno para el equipo" /><button className="btn-secondary mt-3" disabled={pending} type="submit">Agregar nota</button></form></section> : null}
  </div>;
}
