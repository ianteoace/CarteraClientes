"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataList } from "@/components/ui/data-list";
import { ActionDisclosure } from "@/components/ui/action-disclosure";

import {
  cancelCampaignScheduleAction,
  markCampaignReadyAction,
  scheduleCampaignAction,
  simulateCampaignSendAction,
  updateCampaignDraftAction,
  updateCampaignTemplateDraftAction,
} from "@/app/campanas/actions";
import { CampaignTemplatePicker } from "@/components/campaigns/campaign-template-picker";
import { analyzeTemplate, readFrozenParameters, templatePreview, type CampaignTemplateSelection } from "@/lib/campaign-delivery";
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
  UNKNOWN: "Requiere revisión",
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
  const isMeta = campaign.deliveryMode === "META_WHATSAPP";
  const snapshot = campaign.whatsAppTemplate;
  const [template, setTemplate] = useState<CampaignTemplateSelection | undefined>(snapshot?.whatsappConnectionId ? {
    connectionId: snapshot.whatsappConnectionId, templateName: snapshot.templateName, language: snapshot.language, mapping: snapshot.parameterMapping,
  } : undefined);
  const templateAnalysis = snapshot ? analyzeTemplate({ category: snapshot.category, components: snapshot.componentsSnapshot as unknown[] }) : null;

  async function saveTemplate() {
    if (!template) return;
    setError(undefined);
    setIsSaving(true);
    try {
      const result = await updateCampaignTemplateDraftAction(campaign.id, template);
      if (!result.success) setError(result.error); else router.refresh();
    } catch { setError("No se pudo guardar la plantilla. Intentá nuevamente."); }
    finally { setIsSaving(false); }
  }

  function preview(recipient: CampaignDetails["recipients"][number]) {
    if (!isMeta) return personalizeMessage(message, recipient.nameSnapshot);
    if (!templateAnalysis) return campaign.message;
    try { return templatePreview(templateAnalysis, readFrozenParameters(recipient.templateParameters, templateAnalysis.variables.length)); }
    catch { return templatePreview(templateAnalysis, []); }
  }

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
    if (isMeta && !window.confirm(`Se enviará una plantilla de WhatsApp real a ${campaign.recipientCount} destinatarios. ¿Confirmás el envío?`)) return;
    setError(undefined);
    setIsSaving(true);
    try {
      const result = await simulateCampaignSendAction(campaign.id);
      if (!result.success) setError(result.error); else router.refresh();
    } catch { setError("No se pudo confirmar el procesamiento. Revisá el estado antes de intentar otra acción."); }
    finally { setIsSaving(false); }
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

  return <main className="app-page module-page">
    <Link className="text-xs font-semibold text-muted" href="/campanas">← Volver a Campañas</Link>
    <div className="mt-5"><PageHeader eyebrow="Campaña" title={campaign.name} metadata={(campaign.sourceGroupName ?? "Selección manual / grupo eliminado") + " · " + campaign.recipientCount + " destinatarios"} actions={<StatusBadge status={campaign.status}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</StatusBadge>} /></div>
    {error ? <p className="notice-error mt-4" role="alert">{error}</p> : null}
    <div className="document-layout">
      <div className="document-main">
        <section><SectionHeader title={isMeta ? "Plantilla de WhatsApp" : isDraft ? "Mensaje · borrador" : "Mensaje original"} />
          {isMeta && snapshot ? <p className="mt-3 text-sm"><strong>{snapshot.templateName}</strong><span className="ml-2 text-muted">{snapshot.category === "MARKETING" ? "Marketing" : "Utilidad"} · {snapshot.language}</span></p> : null}
          {isDraft && canEdit ? <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <label className="field-label">Nombre<input className="field" defaultValue={campaign.name} name="name" required /></label>
            {isMeta ? <><input name="message" type="hidden" value={campaign.message} /><p className="document-copy">{campaign.message}</p></> : <label className="field-label">Mensaje<textarea className="field min-h-36" name="message" onChange={(event) => setMessage(event.target.value)} required value={message} /></label>}
            <button className="btn-secondary" disabled={isSaving} type="submit">{isSaving ? "Guardando…" : "Guardar cambios"}</button>
          </form> : <p className="document-copy">{campaign.message}</p>}
          {isMeta && isDraft && canEdit && snapshot?.whatsappConnectionId ? <div className="mt-5 space-y-4">
            <CampaignTemplatePicker connectionId={snapshot.whatsappConnectionId} value={template} onChange={setTemplate} />
            <button className="btn-secondary" disabled={isSaving || !template} onClick={saveTemplate} type="button">Guardar plantilla y variables</button>
            <p className="text-xs text-muted">Al marcar como lista, se validarán y congelarán los valores de todos los destinatarios.</p>
          </div> : null}
        </section>
        <section><SectionHeader title="Vista previa personalizada" />
          {campaign.recipients.length === 0 ? <p className="py-4 text-sm text-muted">No hay destinatarios visibles dentro de tu acceso.</p> : null}
          <div className="mt-3 divide-y divide-border">{campaign.recipients.slice(0, 3).map((recipient) => <div className="py-3" key={recipient.id}>
            <p className="text-xs font-semibold">{recipient.nameSnapshot}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{preview(recipient)}</p>
          </div>)}</div>
        </section>
        <section><SectionHeader title="Resultado del procesamiento" /><dl className="metric-strip mt-4">
          <div><dt>Total</dt><dd>{campaign.deliverySummary.total}</dd></div>
          <div><dt>Aceptados</dt><dd className="text-success">{campaign.deliverySummary.accepted}</dd></div>
          {isMeta ? <><div><dt>Entregados</dt><dd>{campaign.deliverySummary.delivered}</dd></div><div><dt>Leídos</dt><dd>{campaign.deliverySummary.read}</dd></div></> : null}
          <div><dt>Fallidos</dt><dd className="text-danger">{campaign.deliverySummary.failed}</dd></div>
          <div><dt>Pendientes</dt><dd>{campaign.deliverySummary.pending}</dd></div>
        </dl>{isMeta ? <p className="mt-3 text-xs text-muted">Completada significa que terminó el envío al proveedor; no garantiza entrega o lectura. Los resultados ambiguos requieren revisión y no se reintentan automáticamente.</p> : null}</section>
        <section><SectionHeader title="Destinatarios" /><div className="mt-4">
          <DataList columns="recipients" label="Destinatarios" headers={["Nombre", "Teléfono", "Estado", isMeta ? "Actualizado" : "ID del proveedor", "Error"]}>
            {campaign.recipients.map((recipient) => <div className="data-row" key={recipient.id}>
              <strong>{recipient.nameSnapshot}</strong><span className="text-muted">{recipient.phoneSnapshot}</span>
              <StatusBadge status={recipient.status}>{RECIPIENT_STATUS_LABELS[recipient.status]}</StatusBadge>
              <span className="break-all text-xs text-muted">{isMeta ? recipient.updatedAt ? new Date(recipient.updatedAt).toLocaleString("es-AR") : "—" : recipient.providerMessageId ?? "—"}</span><span className={recipient.errorMessage ? "text-xs text-danger" : "text-xs text-muted"}>{recipient.errorMessage ?? "—"}</span>
            </div>)}
          </DataList>
        </div></section>
      </div>
      <aside className="document-aside" aria-label="Información de campaña">
        <SectionHeader title="Información" /><dl className="context-section">
          <dt>Estado</dt><dd><StatusBadge status={campaign.status}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</StatusBadge></dd>
          <dt>Canal</dt><dd className="text-xs text-muted">{isMeta ? "WhatsApp · envío real" : "Mock · simulación"}</dd>
          <dt>Audiencia</dt><dd>{campaign.recipientCount} destinatarios</dd>
          <dt>Aceptados / fallidos</dt><dd className="tabular-nums">{campaign.deliverySummary.accepted} / {campaign.deliverySummary.failed}</dd>
          {scheduledLabel ? <><dt>Programada</dt><dd>{scheduledLabel}</dd><dd className="text-xs text-muted">{campaign.scheduledTimezone}</dd></> : null}
        </dl>
        {isDraft && canEdit ? <button className="btn-primary mb-4" disabled={isSaving} onClick={markReady} type="button">Marcar como lista</button> : null}
        {campaign.status === "READY" && canSend ? <div className="context-section"><p className="text-xs leading-5 text-muted">{isMeta ? "Envío real por WhatsApp. Se usará exclusivamente la plantilla aprobada y sus valores congelados." : "Modo simulación — no se enviará ningún WhatsApp real. Se procesarán los destinatarios pendientes con el proveedor mock."}</p><button className="btn-primary mt-3" disabled={isSaving} onClick={simulateSending} type="button">{isSaving ? "Procesando…" : isMeta ? "Enviar por WhatsApp" : "Simular envío"}</button></div> : null}
        {(campaign.status === "READY" || campaign.status === "SCHEDULED") && canSend ? <ActionDisclosure title={campaign.status === "SCHEDULED" ? "Reprogramar envío" : "Programar envío"}>
          <p className="text-xs leading-5 text-muted">{isMeta ? "Se enviará WhatsApp real con la plantilla y los valores congelados en la fecha indicada." : "La audiencia queda congelada y se procesará con mock."}</p>
          <div className="mt-3 space-y-3">
            <label className="field-label">Fecha<input className="field" onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} /></label>
            <label className="field-label">Hora<input className="field" onChange={(event) => setScheduleTime(event.target.value)} type="time" value={scheduleTime} /></label>
            <p className="break-words text-xs text-muted">Zona horaria: {timezone || "Detectando…"}</p>
            <button className="btn-secondary" disabled={isSaving || !timezone} onClick={saveSchedule} type="button">{isSaving ? "Guardando…" : campaign.status === "SCHEDULED" ? "Reprogramar" : "Programar envío"}</button>
          </div>
        </ActionDisclosure> : null}
        {campaign.status === "SCHEDULED" && canSend ? <button className="btn-quiet mt-2" disabled={isSaving} onClick={cancelSchedule} type="button">Cancelar programación</button> : null}
      </aside>
    </div>
  </main>;
}
