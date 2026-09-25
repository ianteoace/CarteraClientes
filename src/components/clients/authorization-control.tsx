"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClientAuthorizationAction } from "@/app/clientes/actions";

export function AuthorizationControl({ clientId, optIn, canEdit }: { clientId: string; optIn: boolean; canEdit: boolean }) {
  const router = useRouter(); const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  async function change(next: boolean) { setSaving(true); setError(undefined); const result = await updateClientAuthorizationAction(clientId, next); setSaving(false); if (!result.success) return setError(result.error); router.refresh(); }
  return <div className="space-y-2"><p className="font-medium">{optIn ? "Autorizado para campañas" : "Sin autorización"}</p>{canEdit ? <div className="flex gap-2"><button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={saving || optIn} onClick={() => change(true)} type="button">Autorizar para campañas</button><button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={saving || !optIn} onClick={() => change(false)} type="button">Quitar autorización</button></div> : null}{error ? <p className="text-sm text-red-700">{error}</p> : null}</div>;
}
