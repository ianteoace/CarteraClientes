"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCampaignAction,
  createManualCampaignAction,
  getCampaignAudienceAction,
  getManualCampaignAudienceAction,
} from "@/app/campanas/actions";
import { personalizeMessage } from "@/lib/campaign-message";
import type { CampaignAudience, CampaignSourceGroup } from "@/lib/campaign-repository";

type CampaignFormProps = {
  groups: CampaignSourceGroup[];
  manual?: boolean;
};

export function CampaignForm({ groups, manual = false }: CampaignFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<CampaignAudience | null>(null);
  const [error, setError] = useState<string>();
  const [isLoadingAudience, setIsLoadingAudience] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const manualIds = useRef<string[]>([]);

  useEffect(() => { if (!manual) return; try { const ids = JSON.parse(sessionStorage.getItem("manual-campaign-contact-ids") ?? "[]") as string[]; manualIds.current = ids; getManualCampaignAudienceAction(ids).then((result) => setAudience(result ? { groupId: "manual", memberCount: result.selectedCount, eligibleCount: result.eligibleCount, clients: result.clients } : null)).catch(() => setError("No se pudo validar la selección.")); } catch { queueMicrotask(() => setError("La selección ya no está disponible.")); } }, [manual]);

  async function handleGroupChange(groupId: string) {
    setError(undefined);
    setAudience(null);

    if (!groupId) {
      return;
    }

    setIsLoadingAudience(true);
    let result: CampaignAudience | null;
    try {
      result = await getCampaignAudienceAction(groupId);
    } catch {
      setIsLoadingAudience(false);
      setError("No tenés acceso al grupo seleccionado.");
      return;
    }
    setIsLoadingAudience(false);

    if (!result) {
      setError("El grupo seleccionado ya no existe.");
      return;
    }

    setAudience(result);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = manual ? await createManualCampaignAction(String(formData.get("name") ?? ""), String(formData.get("message") ?? ""), manualIds.current) : await createCampaignAction(formData);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push(`/campanas/${result.campaignId}`);
    router.refresh();
  }

  return (
    <form className="app-page max-w-3xl space-y-6" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Nueva campaña</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Prepará una campaña sin enviar mensajes todavía.
        </p>
      </div>

      <label className="block space-y-1 text-sm font-medium">
        <span>Nombre de campaña</span>
        <input className="field" name="name" required />
      </label>
      {manual ? <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm">Destinatarios: selección manual</p> : null}

      {!manual ? <label className="block space-y-1 text-sm font-medium">
        <span>Grupo</span>
        <select
          className="field"
          name="sourceGroupId"
          onChange={(event) => handleGroupChange(event.target.value)}
          required
        >
          <option value="">Seleccioná un grupo</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount} miembros)
            </option>
          ))}
        </select>
      </label> : null}

      <label className="block space-y-1 text-sm font-medium">
        <span>Mensaje</span>
        <textarea
          className="field min-h-36"
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Hola {{nombre}}, tenemos una novedad para vos."
          required
          value={message}
        />
      </label>

      {isLoadingAudience ? <p className="text-sm text-zinc-600">Cargando destinatarios…</p> : null}

      {audience ? (
        <section className="surface-muted space-y-4 p-5">
          <div>
            <h2 className="font-semibold">Audiencia prevista</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {audience.memberCount} miembros · {audience.eligibleCount} aptos · {audience.memberCount - audience.eligibleCount} excluidos sin opt-in
            </p>
          </div>

          {audience.eligibleCount === 0 ? (
            <p className="text-sm text-red-700">
              No hay clientes con opt-in habilitado en este grupo.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">Vista previa de destinatarios aptos</p>
              {audience.clients.slice(0, 3).map((client) => (
                <div className="rounded-md bg-white p-3 text-sm" key={client.id}>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-zinc-600">{client.phone}{client.company ? ` · ${client.company}` : ""}</p>
                  <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                    {personalizeMessage(message, client.name) || "Escribí un mensaje para ver la personalización."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="btn-primary"
        disabled={isSubmitting || isLoadingAudience || audience?.eligibleCount === 0}
        type="submit"
      >
        {isSubmitting ? "Guardando..." : "Guardar campaña"}
      </button>
    </form>
  );
}
