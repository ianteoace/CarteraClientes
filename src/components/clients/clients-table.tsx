"use client";

import Link from "next/link";
import type { ClientListItem } from "@/lib/client-repository";

type ClientsTableProps = {
  clients: ClientListItem[];
  onEdit: (client: ClientListItem) => void;
  onDelete: (client: ClientListItem) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleVisible: () => void;
  canEdit: boolean;
  canDelete: boolean;
  canSelect: boolean;
};

function ClientActions({ client, onEdit, onDelete, canEdit, canDelete }: Pick<ClientsTableProps, "onEdit" | "onDelete" | "canEdit" | "canDelete"> & { client: ClientListItem }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
    {canEdit ? <button className="text-muted hover:text-foreground" onClick={() => onEdit(client)} type="button">Editar</button> : null}
    {canDelete ? <button className="text-danger hover:underline" onClick={() => onDelete(client)} type="button">Eliminar</button> : null}
  </div>;
}

export function ClientsTable({ clients, onEdit, onDelete, selectedIds, onToggle, onToggleVisible, canEdit, canDelete, canSelect }: ClientsTableProps) {
  if (clients.length === 0) return <p className="empty-state">No hay contactos que coincidan con la búsqueda o el filtro.</p>;
  const allVisibleSelected = clients.every((client) => selectedIds.has(client.id));
  return <>
    <div className="hidden border-y border-border md:block">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="table-head text-[11px] uppercase tracking-[.08em]">
          <tr>
            {canSelect ? <th className="w-11 px-3 py-3"><input aria-label="Seleccionar contactos visibles" checked={allVisibleSelected} onChange={onToggleVisible} type="checkbox" /></th> : null}
            <th className="w-[26%] px-3 py-3 font-semibold">Nombre</th>
            <th className="w-[24%] px-3 py-3 font-semibold">Teléfono / email</th>
            <th className="w-[19%] px-3 py-3 font-semibold">Empresa</th>
            <th className="w-[18%] px-3 py-3 font-semibold">Autorización</th>
            {canEdit || canDelete ? <th className="px-3 py-3 font-semibold">Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.map((client) => <tr key={client.id}>
            {canSelect ? <td className="px-3 py-3"><input aria-label={`Seleccionar ${client.name}`} checked={selectedIds.has(client.id)} onChange={() => onToggle(client.id)} type="checkbox" /></td> : null}
            <td className="truncate px-3 py-3 font-semibold"><Link className="hover:underline" href={`/clientes/${client.id}`}>{client.name}</Link>{client.notes ? <span aria-label="Tiene notas" className="ml-2 text-xs text-muted">●</span> : null}</td>
            <td className="truncate px-3 py-3 text-muted"><span className="block truncate">{client.phone}</span>{client.email ? <span className="block truncate text-xs">{client.email}</span> : null}</td>
            <td className="truncate px-3 py-3 text-muted">{client.company ?? "—"}</td>
            <td className="px-3 py-3"><span className={client.optIn ? "badge-success" : "badge-neutral"}>{client.optIn ? "Autorizado" : "Sin autorización"}</span></td>
            {canEdit || canDelete ? <td className="px-3 py-3"><ClientActions client={client} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} canDelete={canDelete} /></td> : null}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="border-y border-border md:hidden">
      {canSelect ? <label className="flex min-h-11 items-center gap-3 border-b border-border px-2 text-xs font-medium text-muted"><input checked={allVisibleSelected} onChange={onToggleVisible} type="checkbox" />Seleccionar visibles</label> : null}
      <div className="divide-y divide-border">{clients.map((client) => <article className="flex gap-3 px-2 py-3" key={client.id}>
        {canSelect ? <input aria-label={`Seleccionar ${client.name}`} checked={selectedIds.has(client.id)} className="mt-1 h-5 w-5 shrink-0" onChange={() => onToggle(client.id)} type="checkbox" /> : null}
        <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><Link className="min-w-0 truncate text-sm font-semibold" href={`/clientes/${client.id}`}>{client.name}{client.notes ? <span aria-label="Tiene notas" className="ml-2 text-xs text-muted">●</span> : null}</Link><span className={client.optIn ? "badge-success shrink-0" : "badge-neutral shrink-0"}>{client.optIn ? "Autorizado" : "Sin autorización"}</span></div>
          <p className="mt-1 truncate text-xs text-muted">{client.phone}{client.company ? ` · ${client.company}` : ""}</p>
          {client.email ? <p className="truncate text-xs text-muted">{client.email}</p> : null}
          {canEdit || canDelete ? <div className="mt-2"><ClientActions client={client} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} canDelete={canDelete} /></div> : null}
        </div>
      </article>)}</div>
    </div>
  </>;
}
