"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { updateWorkspaceSettingsAction } from "@/app/configuracion/actions";

export function WorkspaceSettingsForm({ name, description, canEdit }: { name: string; description: string | null; canEdit: boolean }) {
  const router = useRouter(); const [error, setError] = useState<string>(); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(undefined); const result = await updateWorkspaceSettingsAction(new FormData(event.currentTarget)); setSaving(false); if (!result.success) return setError(result.error); router.refresh(); }
  return <form className="surface space-y-4 p-6" onSubmit={submit}><h2 className="text-xl font-semibold">Mi cartera</h2><label className="field-label"><span>Nombre de la cartera</span><input className="field" defaultValue={name} disabled={!canEdit} maxLength={120} name="name" required /></label><label className="field-label"><span>Descripción</span><textarea className="field min-h-28" defaultValue={description ?? ""} disabled={!canEdit} maxLength={1000} name="description" /></label>{error ? <p className="text-sm text-danger">{error}</p> : null}{canEdit ? <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar cambios"}</button> : <p className="text-sm text-muted">Tenés acceso de solo lectura.</p>}</form>;
}
