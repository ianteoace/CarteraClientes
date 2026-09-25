"use client";

import Link from "next/link";

import type { GroupListItem } from "@/lib/group-repository";

type GroupsTableProps = {
  groups: GroupListItem[];
  onEdit: (group: GroupListItem) => void;
  onDelete: (group: GroupListItem) => void;
  canEdit: boolean;
  canDelete: boolean;
};

export function GroupsTable({ groups, onEdit, onDelete, canEdit, canDelete }: GroupsTableProps) {
  if (groups.length === 0) {
    return (
      <p className="empty-state">
        No hay grupos que coincidan con la búsqueda.
      </p>
    );
  }

  return (
    <div className="table-shell">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Descripción</th>
            <th className="px-4 py-3 font-medium">Clientes</th>
            <th className="px-4 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {groups.map((group) => (
            <tr key={group.id}>
              <td className="px-4 py-3 font-medium">{group.name}</td>
              <td className="px-4 py-3 text-zinc-600">{group.description ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{group.memberCount}</td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  <Link className="font-medium text-zinc-700 hover:text-zinc-950" href={`/grupos/${group.id}`}>
                    Ver / administrar
                  </Link>
                  {canEdit ? <button
                    className="font-medium text-zinc-700 hover:text-zinc-950"
                    onClick={() => onEdit(group)}
                    type="button"
                  >
                    Editar
                  </button> : null}
                  {canDelete ? <button
                    className="font-medium text-red-700 hover:text-red-900"
                    onClick={() => onDelete(group)}
                    type="button"
                  >
                    Eliminar
                  </button> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
