"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteGroupAction } from "@/app/grupos/actions";
import type { GroupListItem } from "@/lib/group-repository";

import { GroupForm } from "./group-form";
import { GroupsTable } from "./groups-table";

type GroupsManagerProps = {
  groups: GroupListItem[];
  permissions: { create: boolean; edit: boolean; delete: boolean };
};

export function GroupsManager({ groups, permissions }: GroupsManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<GroupListItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState<string>();

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return groups;
    }

    return groups.filter((group) =>
      group.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [groups, query]);

  function openNewGroupForm() {
    setSelectedGroup(null);
    setError(undefined);
    setIsFormOpen(true);
  }

  function openEditGroupForm(group: GroupListItem) {
    setSelectedGroup(group);
    setError(undefined);
    setIsFormOpen(true);
  }

  async function handleDelete(group: GroupListItem) {
    const shouldDelete = window.confirm(
      `¿Eliminar el grupo ${group.name}? Los clientes no se eliminarán.`,
    );

    if (!shouldDelete) {
      return;
    }

    setError(undefined);
    const result = await deleteGroupAction(group.id);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <section className="app-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Organización</p><h1 className="page-heading">Grupos</h1>
          <p className="page-description">
            {groups.length} {groups.length === 1 ? "grupo registrado" : "grupos registrados"}
          </p>
        </div>
        {permissions.create ? <button
          className="btn-primary"
          onClick={openNewGroupForm}
          type="button"
        >
          Nuevo grupo
        </button> : null}
      </div>

      <input
        aria-label="Buscar grupos"
        className="field"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre"
        type="search"
        value={query}
      />

      {error ? (
        <p className="notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <GroupsTable groups={filteredGroups} onDelete={handleDelete} onEdit={openEditGroupForm} canEdit={permissions.edit} canDelete={permissions.delete} />

      {isFormOpen ? (
        <GroupForm group={selectedGroup ?? undefined} onClose={() => setIsFormOpen(false)} />
      ) : null}
    </section>
  );
}
