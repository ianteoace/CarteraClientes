"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  markCampaignReadyAction,
  simulateCampaignSendAction,
  updateCampaignDraftAction,
} from "@/app/campanas/actions";
import { personalizeMessage } from "@/lib/campaign-message";
import type { CampaignDetails } from "@/lib/campaign-repository";

type CampaignDetailProps = {
  campaign: CampaignDetails;
  canEdit: boolean;
  canSend: boolean;
};

const CAMPAIGN_STATUS_LABELS: Record<CampaignDetails["status"], string> = {
  DRAFT: "Borrador",
  READY: "Lista",
  SENDING: "Enviando",
  COMPLETED: "Completada",
  PARTIAL: "Completada parcialmente",
  FAILED: "Fallida",
};

const RECIPIENT_STATUS_LABELS: Record<CampaignDetails["recipients"][number]["status"], string> = {
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  ACCEPTED: "Aceptado",
  DELIVERED: "Entregado",
  READ: "Leído",
  FAILED: "Fallido",
};

export function CampaignDetail({ campaign, canEdit, canSend }: CampaignDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(campaign.message);
  const isDraft = campaign.status === "DRAFT";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSaving(true);
    const result = await updateCampaignDraftAction(campaign.id, new FormData(event.currentTarget));
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  async function markReady() {
    setError(undefined);
    setIsSaving(true);
    const result = await markCampaignReadyAction(campaign.id);
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  async function simulateSending() {
    setError(undefined);
    setIsSaving(true);
    const result = await simulateCampaignSendAction(campaign.id);
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {CAMPAIGN_STATUS_LABELS[campaign.status]} · {campaign.sourceGroupName ?? "Grupo de origen eliminado"} · {campaign.recipientCount} destinatarios
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {isDraft && canEdit ? (
        <form className="max-w-3xl space-y-4 rounded-lg border border-zinc-200 p-5" onSubmit={handleSubmit}>
          <h2 className="text-xl font-semibold">Editar borrador</h2>
          <label className="block space-y-1 text-sm font-medium">
            <span>Nombre</span>
            <input className="w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={campaign.name} name="name" required />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Mensaje</span>
            <textarea
              className="min-h-36 w-full rounded-md border border-zinc-300 px-3 py-2"
              name="message"
              onChange={(event) => setMessage(event.target.value)}
              required
              value={message}
            />
          </label>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      ) : (
        <section className="max-w-3xl rounded-lg border border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">Mensaje original</h2>
          <p className="mt-3 whitespace-pre-wrap text-zinc-700">{campaign.message}</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Vista previa personalizada</h2>
        {campaign.recipients.length === 0 ? <p className="text-sm text-muted">No hay destinatarios visibles dentro de tu acceso.</p> : null}
        {campaign.recipients.slice(0, 3).map((recipient) => (
          <div className="rounded-lg border border-zinc-200 p-4" key={recipient.id}>
            <p className="text-sm font-medium">{recipient.nameSnapshot}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {personalizeMessage(message, recipient.nameSnapshot)}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Resultado del procesamiento</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm text-zinc-600">Total</p>
            <p className="mt-1 text-2xl font-semibold">{campaign.deliverySummary.total}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm text-zinc-600">Aceptados</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{campaign.deliverySummary.accepted}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm text-zinc-600">Fallidos</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">{campaign.deliverySummary.failed}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm text-zinc-600">Pendientes</p>
            <p className="mt-1 text-2xl font-semibold">{campaign.deliverySummary.pending}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Destinatarios</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">ID del proveedor</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {campaign.recipients.map((recipient) => (
                <tr key={recipient.id}>
                  <td className="px-4 py-3 font-medium">{recipient.nameSnapshot}</td>
                  <td className="px-4 py-3 text-zinc-600">{recipient.phoneSnapshot}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {RECIPIENT_STATUS_LABELS[recipient.status]}
                  </td>
                  <td className="max-w-64 break-all px-4 py-3 text-zinc-600">
                    {recipient.providerMessageId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-red-700">{recipient.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isDraft && canEdit ? (
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSaving} onClick={markReady} type="button">
          Marcar como lista
        </button>
      ) : null}

      {campaign.status === "READY" && canSend ? (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div>
            <h2 className="font-semibold text-amber-950">Modo simulación</h2>
            <p className="mt-1 text-sm text-amber-900">
              No se enviará ningún WhatsApp real. Se procesarán los destinatarios pendientes con el proveedor mock.
            </p>
          </div>
          <button
            className="rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={simulateSending}
            type="button"
          >
            {isSaving ? "Simulando..." : "Simular envío"}
          </button>
        </section>
      ) : null}
    </section>
  );
}
