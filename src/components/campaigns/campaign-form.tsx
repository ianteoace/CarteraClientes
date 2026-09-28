"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";

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
    <form className="app-page module-page max-w-4xl space-y-5" onSubmit={handleSubmit}>
      <Link className="text-xs font-semibold text-muted" href="/campanas">← Volver a Campañas</Link><PageHeader eyebrow="Comunicación" title="Nueva campaña" description="Prepará una campaña sin enviar mensajes todavía." />

      <label className="field-label">
        <span>Nombre de campaña</span>
        <input className="field" name="name" required />
      </label>
      {manual ? <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm">Destinatarios: selección manual</p> : null}

      {!manual ? <label className="field-label">
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

      <label className="field-label">
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
        <section className="space-y-4 border-y border-border py-5">
          <div>
            <SectionHeader title="Audiencia prevista" />
            <p className="mt-1 text-sm text-zinc-600">
              {audience.memberCount} miembros · {audience.eligibleCount} aptos · {audience.memberCount - audience.eligibleCount} sin autorización
            </p>
          </div>

          {audience.eligibleCount === 0 ? (
            <p className="text-sm text-red-700">
              No hay contactos autorizados para campañas en este grupo.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">Vista previa de destinatarios aptos</p>
              {audience.clients.slice(0, 3).map((client) => (
                <div className="border-b border-border py-3 text-sm" key={client.id}>
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
        <p className="notice-error" role="alert">
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
