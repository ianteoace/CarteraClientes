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

export function ClientsTable({ clients, onEdit, onDelete, selectedIds, onToggle, onToggleVisible, canEdit, canDelete, canSelect }: ClientsTableProps) {
  if (clients.length === 0) {
    return (
      <p className="empty-state">
        No hay contactos que coincidan con la búsqueda o el filtro.
      </p>
    );
  }

  return (
    <div className="table-shell">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="table-head">
          <tr>
            {canSelect ? <th className="px-3 py-3"><input aria-label="Seleccionar contactos visibles" checked={clients.length > 0 && clients.every((client) => selectedIds.has(client.id))} onChange={onToggleVisible} type="checkbox" /></th> : null}
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Teléfono</th>
            <th className="px-4 py-3 font-medium">Empresa</th>
            <th className="px-4 py-3 font-medium">Consentimiento</th>
            {canEdit || canDelete ? <th className="px-4 py-3 font-medium">Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {clients.map((client) => (
            <tr key={client.id}>
              {canSelect ? <td className="px-3 py-3"><input aria-label={`Seleccionar ${client.name}`} checked={selectedIds.has(client.id)} onChange={() => onToggle(client.id)} type="checkbox" /></td> : null}
              <td className="px-4 py-3 font-medium"><Link className="hover:underline" href={`/clientes/${client.id}`}>{client.name}</Link>{client.notes ? <span aria-label="Tiene notas" className="ml-2 text-xs text-zinc-400">●</span> : null}</td>
              <td className="px-4 py-3 text-zinc-600"><span className="block">{client.phone}</span>{client.email ? <span className="block text-xs">{client.email}</span> : null}</td>
              <td className="px-4 py-3 text-zinc-600">{client.company ?? "—"}</td>
              <td className="px-4 py-3">
                <span
                  className={
                    client.optIn
                      ? "badge-success"
                      : "badge-neutral"
                  }
                >
                  {client.optIn ? "Autorizado para campañas" : "Sin autorización"}
                </span>
              </td>
              {canEdit || canDelete ? <td className="px-4 py-3">
                <div className="flex gap-3">
                  {canEdit ?
                  <button
                    className="font-medium text-zinc-700 hover:text-zinc-950"
                    onClick={() => onEdit(client)}
                    type="button"
                  >
                    Editar
                  </button> : null}
                  {canDelete ?
                  <button
                    className="font-medium text-red-700 hover:text-red-900"
                    onClick={() => onDelete(client)}
                    type="button"
                  >
                    Eliminar
                  </button> : null}
                </div>
              </td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
