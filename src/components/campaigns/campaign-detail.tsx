"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import {
  cancelCampaignScheduleAction,
  markCampaignReadyAction,
  scheduleCampaignAction,
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
  SCHEDULED: "Programada",
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

function subscribeToBrowserEnvironment() {
  return () => undefined;
}

export function CampaignDetail({ campaign, canEdit, canSend }: CampaignDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(campaign.message);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const timezone = useSyncExternalStore(
    subscribeToBrowserEnvironment,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "",
  );
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

  async function saveSchedule() {
    if (!scheduleDate || !scheduleTime || !timezone) {
      setError("Elegí una fecha y hora válidas.");
      return;
    }

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError("Elegí una fecha y hora válidas.");
      return;
    }

    setError(undefined);
    setIsSaving(true);
    const result = await scheduleCampaignAction(campaign.id, scheduledAt.toISOString(), timezone);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function cancelSchedule() {
    setError(undefined);
    setIsSaving(true);
    const result = await cancelCampaignScheduleAction(campaign.id);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const scheduledLabel = campaign.scheduledAt && campaign.scheduledTimezone
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: campaign.scheduledTimezone,
      }).format(new Date(campaign.scheduledAt))
    : null;

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
        <section className="space-y-5 border-y border-amber-200 bg-amber-50 px-1 py-5">
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
          <div className="border-t border-amber-200 pt-5">
            <h2 className="font-semibold text-amber-950">Programar envío</h2>
            <p className="mt-1 text-sm text-amber-900">La audiencia queda congelada y se procesará con el proveedor mock.</p>
            <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-amber-950">
                <span>Fecha</span>
                <input className="w-full rounded-md border border-amber-300 bg-white px-3 py-2" onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} />
              </label>
              <label className="space-y-1 text-sm font-medium text-amber-950">
                <span>Hora</span>
                <input className="w-full rounded-md border border-amber-300 bg-white px-3 py-2" onChange={(event) => setScheduleTime(event.target.value)} type="time" value={scheduleTime} />
              </label>
            </div>
            <p className="mt-3 text-sm text-amber-900">Zona horaria: {timezone || "Detectando…"}</p>
            <button className="mt-4 rounded-md border border-amber-800 px-4 py-2 text-sm font-medium text-amber-950 disabled:opacity-60" disabled={isSaving || !timezone} onClick={saveSchedule} type="button">
              {isSaving ? "Programando…" : "Programar envío"}
            </button>
          </div>
        </section>
      ) : null}

      {campaign.status === "SCHEDULED" && canSend ? (
        <section className="space-y-5 border-y border-sky-200 bg-sky-50 px-1 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Programada</p>
            <p className="mt-2 text-xl font-semibold text-sky-950">{scheduledLabel}</p>
            <p className="mt-1 text-sm text-sky-800">{campaign.scheduledTimezone}</p>
            <p className="mt-2 text-sm text-sky-900">Modo simulación — no se enviará ningún WhatsApp real.</p>
          </div>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-sky-950">
              <span>Nueva fecha</span>
              <input className="w-full rounded-md border border-sky-300 bg-white px-3 py-2" onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} />
            </label>
            <label className="space-y-1 text-sm font-medium text-sky-950">
              <span>Nueva hora</span>
              <input className="w-full rounded-md border border-sky-300 bg-white px-3 py-2" onChange={(event) => setScheduleTime(event.target.value)} type="time" value={scheduleTime} />
            </label>
          </div>
          <p className="text-sm text-sky-800">Zona horaria: {timezone || "Detectando…"}</p>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-md bg-sky-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSaving || !timezone} onClick={saveSchedule} type="button">
              {isSaving ? "Guardando…" : "Reprogramar"}
            </button>
            <button className="rounded-md border border-sky-800 px-4 py-2 text-sm font-medium text-sky-950 disabled:opacity-60" disabled={isSaving} onClick={cancelSchedule} type="button">
              Cancelar programación
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
