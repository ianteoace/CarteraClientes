"use client";

import { GroupScopeMode, WorkspaceRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { createInvitationAction } from "@/app/equipo/invitation-actions";

export function InvitationForm({ groups, canGrantAll }: { groups: { id: string; name: string }[]; canGrantAll: boolean }) {
  const router = useRouter();
  const [scope, setScope] = useState<GroupScopeMode>(GroupScopeMode.SELECTED);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (scope === GroupScopeMode.ALL) data.delete("groupIds");
    setMessage(undefined); setError(undefined);
    startTransition(async () => {
      const result = await createInvitationAction(data);
      if (!result.success) { setError(result.error); return; }
      setMessage(result.emailSent ? "Invitación enviada." : "Invitación creada, pero el email no pudo enviarse. Podés reenviarla desde la lista.");
      form.reset(); setScope(GroupScopeMode.SELECTED); router.refresh();
    });
  }

  return <form onSubmit={submit} className="space-y-5 border-t border-border pt-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="field-label"><span>Email</span><input className="field" name="email" type="email" autoComplete="off" maxLength={254} required /></label>
      <label className="field-label"><span>Rol inicial</span><select className="field" name="role" defaultValue={WorkspaceRole.AGENT}>
        <option value={WorkspaceRole.ADMIN}>Administrador</option><option value={WorkspaceRole.AGENT}>Agente</option><option value={WorkspaceRole.VIEWER}>Solo lectura</option>
      </select></label>
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Acceso a grupos</legend>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="groupScopeMode" value={GroupScopeMode.SELECTED} checked={scope === GroupScopeMode.SELECTED} onChange={() => setScope(GroupScopeMode.SELECTED)} />Solo grupos seleccionados</label>
      {canGrantAll ? <label className="flex items-center gap-2 text-sm"><input type="radio" name="groupScopeMode" value={GroupScopeMode.ALL} checked={scope === GroupScopeMode.ALL} onChange={() => setScope(GroupScopeMode.ALL)} />Todos los grupos</label> : null}
      {scope === GroupScopeMode.SELECTED ? <div className="max-h-44 space-y-1 overflow-y-auto border-l border-border pl-4">
        {groups.length ? groups.map((group) => <label key={group.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" name="groupIds" value={group.id} />{group.name}</label>) : <p className="text-sm text-muted">Sin grupos disponibles. Podés invitar sin acceso a grupos.</p>}
      </div> : null}
    </fieldset>
    {error ? <p className="notice-error" role="alert">{error}</p> : null}
    {message ? <p className="text-sm text-emerald-700" role="status">{message}</p> : null}
    <button className="btn-primary" disabled={pending} type="submit">{pending ? "Creando..." : "Enviar invitación"}</button>
  </form>;
}
