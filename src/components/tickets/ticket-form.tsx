"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createTicketAction } from "@/app/tickets/actions";
import { CASE_PRIORITY } from "@/lib/case-types";
import { TICKET_PRIORITY_LABELS } from "@/lib/ticket-labels";

type ContactOption = { id: string; name: string; phone: string; email: string | null };
type MemberOption = { id: string; label: string; eligibleContactIds: string[] };

export function TicketForm({ contacts, members, initialContactId }: {
  contacts: ContactOption[];
  members: MemberOption[];
  initialContactId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const visibleContacts = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value ? contacts.filter((contact) => [contact.name, contact.phone, contact.email ?? ""].some((field) => field.toLocaleLowerCase().includes(value))) : contacts;
  }, [contacts, query]);
  const eligibleMembers = members.filter((member) => contactId && member.eligibleContactIds.includes(contactId));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await createTicketAction(new FormData(event.currentTarget));
    setPending(false);
    if (!result.success) return setError(result.error);
    router.push(`/tickets/${result.number}`);
    router.refresh();
  }

  return <form className="mt-7 max-w-3xl space-y-7" onSubmit={submit}>
    <section className="border-y border-border py-5">
      <label className="field-label" htmlFor="ticket-contact-search">Buscar contacto</label>
      <input id="ticket-contact-search" className="field mt-1" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, teléfono o email" />
      <label className="field-label mt-4" htmlFor="ticket-contact">Contacto *</label>
      <select id="ticket-contact" className="field mt-1" name="contactId" required value={contactId} onChange={(event) => setContactId(event.target.value)}>
        <option value="">Seleccioná un contacto</option>
        {visibleContacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.phone}</option>)}
      </select>
      {query && !visibleContacts.some((contact) => contact.id === contactId) && contactId ? <p className="mt-2 text-xs text-muted">El contacto seleccionado permanece activo aunque no coincida con la búsqueda.</p> : null}
    </section>

    <div className="grid gap-5 sm:grid-cols-2">
      <label className="field-label sm:col-span-2">Título *<input className="field mt-1" name="title" required maxLength={200} /></label>
      <label className="field-label sm:col-span-2">Descripción<textarea className="field mt-1 min-h-32" name="description" maxLength={10000} /></label>
      <label className="field-label">Prioridad<select className="field mt-1" name="priority" defaultValue={CASE_PRIORITY.NORMAL}>{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{TICKET_PRIORITY_LABELS[priority]}</option>)}</select></label>
      <label className="field-label">Responsable<select className="field mt-1" name="assignedMemberId" disabled={!contactId}><option value="">Sin responsable</option>{eligibleMembers.map((member) => <option value={member.id} key={member.id}>{member.label}</option>)}</select></label>
    </div>

    <fieldset disabled={!contactId}>
      <legend className="text-sm font-semibold">Participantes opcionales</legend>
      <p className="mt-1 text-xs text-muted">Solo se muestran miembros que pueden abrir el contacto seleccionado.</p>
      <div className="mt-3 grid gap-2 border-y border-border py-3 sm:grid-cols-2">
        {eligibleMembers.length ? eligibleMembers.map((member) => <label className="flex min-h-10 items-center gap-3 text-sm" key={member.id}><input className="h-5 w-5 accent-black" name="participantIds" type="checkbox" value={member.id} />{member.label}</label>) : <p className="text-sm text-muted">Seleccioná un contacto para ver miembros elegibles.</p>}
      </div>
    </fieldset>

    {error ? <p className="notice-error" role="alert">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending || !contactId} type="submit">{pending ? "Creando…" : "Crear ticket"}</button><button className="btn-secondary" onClick={() => router.back()} type="button">Cancelar</button></div>
  </form>;
}
