"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createIncidentAction } from "@/app/incidencias/actions";
import { CASE_PRIORITY } from "@/lib/case-types";
import { INCIDENT_PRIORITY_LABELS } from "@/lib/incident-labels";

type MemberOption = { id: string; label: string };

export function IncidentForm({ members }: { members: MemberOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await createIncidentAction(new FormData(event.currentTarget));
    setPending(false);
    if (!result.success) return setError(result.error);
    router.push(`/incidencias/${result.number}`);
    router.refresh();
  }

  return <form className="mt-7 max-w-3xl space-y-7" onSubmit={submit}>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="field-label sm:col-span-2">Título *<input className="field mt-1" name="title" required maxLength={200} /></label>
      <label className="field-label sm:col-span-2">Descripción<textarea className="field mt-1 min-h-32" name="description" maxLength={10000} /></label>
      <label className="field-label">Prioridad<select className="field mt-1" name="priority" defaultValue={CASE_PRIORITY.NORMAL}>{Object.values(CASE_PRIORITY).map((priority) => <option value={priority} key={priority}>{INCIDENT_PRIORITY_LABELS[priority]}</option>)}</select></label>
      <label className="field-label">Responsable<select className="field mt-1" name="assignedMemberId"><option value="">Sin responsable</option>{members.map((member) => <option value={member.id} key={member.id}>{member.label}</option>)}</select></label>
    </div>
    <fieldset>
      <legend className="text-sm font-semibold">Participantes opcionales</legend>
      <p className="mt-1 text-xs text-muted">Solo miembros con acceso completo a grupos pueden participar.</p>
      <div className="mt-3 grid gap-2 border-y border-border py-3 sm:grid-cols-2">
        {members.length ? members.map((member) => <label className="flex min-h-10 items-center gap-3 text-sm" key={member.id}><input className="h-5 w-5 accent-black" name="participantIds" type="checkbox" value={member.id} />{member.label}</label>) : <p className="text-sm text-muted">No hay miembros elegibles.</p>}
      </div>
    </fieldset>
    {error ? <p className="notice-error" role="alert">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending} type="submit">{pending ? "Creando…" : "Crear incidencia"}</button><button className="btn-secondary" onClick={() => router.back()} type="button">Cancelar</button></div>
  </form>;
}
