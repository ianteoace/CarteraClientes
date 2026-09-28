"use client";
import Link from "next/link";
import { useState } from "react";
import { DataList } from "@/components/ui/data-list";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CampaignListItem } from "@/lib/campaign-repository";
const LABELS: Record<CampaignListItem["status"], string> = { DRAFT: "Borrador", READY: "Lista", SCHEDULED: "Programada", SENDING: "Enviando", COMPLETED: "Completada", PARTIAL: "Parcial", FAILED: "Fallida" };
export function CampaignsTable({ campaigns }: { campaigns: CampaignListItem[] }) {
  const [status, setStatus] = useState("");
  const visible = campaigns.filter((campaign) => !status || campaign.status === status);
  return <>
    <div className="module-toolbar"><label className="field-label">Estado<select className="field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option>{Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><p className="self-end pb-2 text-xs text-muted" role="status">{visible.length} campañas</p></div>
    {visible.length ? <DataList columns="campaigns" label="Campañas" headers={["Nombre", "Estado", "Audiencia", "Fecha / programación", "Resultado", "Acción"]}>
      {visible.map((campaign) => <Link className="data-row" href={`/campanas/${campaign.id}`} key={campaign.id}>
        <strong className="truncate">{campaign.name}</strong><StatusBadge status={campaign.status}>{LABELS[campaign.status]}</StatusBadge>
        <span className="text-muted">{campaign.sourceGroupName ?? "Selección manual"}<span className="mt-1 block text-xs">{campaign.recipientCount} destinatarios</span></span>
        <time className="text-muted" dateTime={campaign.scheduledAt ?? campaign.createdAt}>{campaign.status === "SCHEDULED" && campaign.scheduledAt && campaign.scheduledTimezone ? <>Programada · {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: campaign.scheduledTimezone }).format(new Date(campaign.scheduledAt))}</> : campaign.createdAt.slice(0, 10)}</time>
        <span className="text-muted">{["COMPLETED", "PARTIAL", "FAILED"].includes(campaign.status) ? LABELS[campaign.status] : "—"}</span><span className="text-xs font-semibold">Abrir →</span>
      </Link>)}
    </DataList> : <p className="empty-state">{campaigns.length ? "No hay campañas con este estado." : "Todavía no hay campañas."}</p>}
  </>;
}
