"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createContactFromConversationAction, linkConversationAction, setConversationArchivedAction,
} from "@/app/bandeja/actions";

type ContactOption = { id: string; name: string; phone: string; company: string | null };
type GroupOption = { id: string; name: string };

export function ArchiveControl({ conversationId, archived }: { conversationId: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changeStatus() {
    setBusy(true);
    const result = await setConversationArchivedAction(conversationId, !archived);
    setBusy(false);
    if (result.success) router.refresh(); else setError(result.error);
  }
  return <div><button className="btn-secondary" disabled={busy} onClick={changeStatus} type="button">{archived ? "Reabrir" : "Archivar"}</button>{error ? <p className="mt-1 text-xs text-red-700" role="alert">{error}</p> : null}</div>;
}

export function ContactAssociation({ conversationId, participantId, displayName, contacts, groups, groupRequired, canLink, canCreate, channel = "WHATSAPP" }: {
  conversationId: string;
  participantId: string;
  displayName: string | null;
  contacts: ContactOption[];
  groups: GroupOption[];
  groupRequired: boolean;
  canLink: boolean;
  canCreate: boolean;
  channel?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "create" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const clientId = String(new FormData(event.currentTarget).get("clientId") ?? "");
    const result = await linkConversationAction(conversationId, clientId);
    setBusy(false);
    if (result.success) router.refresh(); else setError(result.error);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const result = await createContactFromConversationAction(conversationId, new FormData(event.currentTarget));
    setBusy(false);
    if (result.success) router.refresh(); else setError(result.error);
  }

  return <section className="inbox-contact-association">
    <div className="flex flex-wrap gap-2">{canLink ? <button className="btn-secondary" onClick={() => setMode(mode === "link" ? null : "link")} type="button">Vincular contacto existente</button> : null}{canCreate ? <button className="btn-secondary" onClick={() => setMode(mode === "create" ? null : "create")} type="button">Crear contacto</button> : null}</div>
    {mode === "link" ? <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={submitLink}>
      <label className="min-w-0 flex-1 text-sm">Contacto<select className="field mt-1" name="clientId" required defaultValue=""><option value="" disabled>Elegí un contacto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.phone}</option>)}</select></label>
      <button className="btn-primary" disabled={busy || !contacts.length} type="submit">Vincular</button>
      {!contacts.length ? <p className="w-full text-sm text-muted">No hay contactos visibles para esta búsqueda.</p> : null}
    </form> : null}
    {mode === "create" ? <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitCreate}>
      <label className="text-sm">Nombre<input className="field mt-1" defaultValue={displayName ?? ""} name="name" required /></label>
      <label className="text-sm">Teléfono<input className="field mt-1" defaultValue={channel === "WHATSAPP" && participantId ? `+${participantId}` : ""} name="phone" required /></label>
      <label className="text-sm">Empresa<input className="field mt-1" name="company" /></label>
      <label className="text-sm">Email<input className="field mt-1" defaultValue={channel === "EMAIL" ? participantId : ""} name="email" type="email" /></label>
      <label className="text-sm sm:col-span-2">Notas<textarea className="field mt-1 min-h-20" maxLength={5000} name="notes" /></label>
      {groups.length ? <fieldset className="sm:col-span-2"><legend className="text-sm">Grupos {groupRequired ? "(elegí al menos uno)" : "(opcional)"}</legend><div className="mt-2 flex flex-wrap gap-3">{groups.map((group) => <label className="text-sm" key={group.id}><input className="mr-2" name="groupIds" type="checkbox" value={group.id} />{group.name}</label>)}</div></fieldset> : null}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || (groupRequired && !groups.length)} type="submit">Guardar contacto</button></div>
    </form> : null}
    {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
  </section>;
}
