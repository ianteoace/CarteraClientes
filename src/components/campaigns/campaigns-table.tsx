import Link from "next/link";

import type { CampaignListItem } from "@/lib/campaign-repository";

type CampaignsTableProps = {
  campaigns: CampaignListItem[];
};

function statusLabel(status: CampaignListItem["status"]) {
  const labels: Record<CampaignListItem["status"], string> = {
    DRAFT: "Borrador",
    READY: "Lista",
    SCHEDULED: "Programada",
    SENDING: "Enviando",
    COMPLETED: "Completada",
    PARTIAL: "Parcial",
    FAILED: "Fallida",
  };

  return labels[status];
}

export function CampaignsTable({ campaigns }: CampaignsTableProps) {
  if (campaigns.length === 0) {
    return (
      <p className="empty-state">
        Todavía no hay campañas creadas.
      </p>
    );
  }

  return (
    <div className="table-shell">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Grupo de origen</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Destinatarios</th>
            <th className="px-4 py-3 font-medium">Creada</th>
            <th className="px-4 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td className="px-4 py-3 font-medium">{campaign.name}</td>
              <td className="px-4 py-3 text-zinc-600">{campaign.sourceGroupName ?? "Selección manual"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">{statusLabel(campaign.status)}</span></td>
              <td className="px-4 py-3 text-zinc-600">{campaign.recipientCount}</td>
              <td className="px-4 py-3 text-zinc-600">
                <span>{campaign.createdAt.slice(0, 10)}</span>
                {campaign.status === "SCHEDULED" && campaign.scheduledAt && campaign.scheduledTimezone ? (
                  <span className="mt-1 block text-xs text-sky-700">
                    Programada · {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: campaign.scheduledTimezone }).format(new Date(campaign.scheduledAt))}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <Link className="font-medium text-zinc-700 hover:text-zinc-950" href={`/campanas/${campaign.id}`}>
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
