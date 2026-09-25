"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addClientsToGroupAction,
  removeClientFromGroupAction,
} from "@/app/grupos/actions";
import type { ClientListItem } from "@/lib/client-repository";
import type { GroupDetails, GroupMember } from "@/lib/group-repository";

type GroupMembersManagerProps = {
  group: GroupDetails;
  clients: ClientListItem[];
  canViewContacts: boolean;
  canManageMembers: boolean;
};

function OptInBadge({ optIn }: { optIn: boolean }) {
  return (
    <span
      className={
        optIn
          ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
          : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600"
      }
    >
      {optIn ? "Habilitado" : "No habilitado"}
    </span>
  );
}

function ClientInformation({ client }: { client: ClientListItem | GroupMember }) {
  return (
    <>
      <td className="px-4 py-3 font-medium">{client.name}</td>
      <td className="px-4 py-3 text-zinc-600">{client.phone}</td>
      <td className="px-4 py-3 text-zinc-600">{client.company ?? "—"}</td>
      <td className="px-4 py-3">
        <OptInBadge optIn={client.optIn} />
      </td>
    </>
  );
}

export function GroupMembersManager({ group, clients, canViewContacts, canManageMembers }: GroupMembersManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const memberIds = useMemo(() => new Set(group.members.map((member) => member.id)), [group.members]);

  const availableClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return clients.filter((client) => {
      if (memberIds.has(client.id)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [client.name, client.phone, client.company ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
  }, [clients, memberIds, query]);

  function toggleClient(clientId: string) {
    setSelectedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId],
    );
  }

  async function addSelectedClients() {
    setError(undefined);
    setIsSaving(true);
    const result = await addClientsToGroupAction(group.id, selectedClientIds);
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSelectedClientIds([]);
    router.refresh();
  }

  async function removeMember(client: GroupMember) {
    setError(undefined);
    const result = await removeClientFromGroupAction(group.id, client.id);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <section className="app-page space-y-8">
      <div className="space-y-3">
        <Link className="text-sm font-semibold text-primary hover:underline" href="/grupos">
          ← Volver a grupos
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{group.name}</h1>
          {group.description ? <p className="mt-1 text-zinc-600">{group.description}</p> : null}
          <p className="mt-2 text-sm text-zinc-600">
            {group.memberCount} {group.memberCount === 1 ? "miembro" : "miembros"}
          </p>
        </div>
      </div>

      {error ? (
        <p className="notice-error" role="alert">
          {error}
        </p>
      ) : null}

      {canViewContacts ? <section className="space-y-3">
        <h2 className="text-xl font-semibold">Clientes asignados</h2>
        {group.members.length === 0 ? (
          <p className="empty-state">
            Este grupo todavía no tiene clientes asignados.
          </p>
        ) : (
          <div className="table-shell">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Opt-in</th>
                  {canManageMembers ? <th className="px-4 py-3 font-medium">Acciones</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {group.members.map((client) => (
                  <tr key={client.id}>
                    <ClientInformation client={client} />
                    {canManageMembers ? <td className="px-4 py-3">
                      <button
                        className="font-medium text-red-700 hover:text-red-900"
                        onClick={() => removeMember(client)}
                        type="button"
                      >
                        Quitar
                      </button>
                    </td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section> : <p className="text-sm text-muted">No tenés permiso para ver los contactos de este grupo.</p>}

      {canManageMembers ? <section className="space-y-3 border-t border-zinc-200 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Agregar clientes existentes</h2>
          <button
            className="btn-primary"
            disabled={isSaving || selectedClientIds.length === 0}
            onClick={addSelectedClients}
            type="button"
          >
            {isSaving ? "Agregando..." : `Agregar seleccionados (${selectedClientIds.length})`}
          </button>
        </div>

        <input
          aria-label="Buscar clientes para agregar"
          className="field"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, teléfono o empresa"
          type="search"
          value={query}
        />

        {availableClients.length === 0 ? (
          <p className="empty-state">
            No hay clientes disponibles para agregar.
          </p>
        ) : (
          <div className="table-shell">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="w-12 px-4 py-3 font-medium">
                    <span className="sr-only">Seleccionar</span>
                  </th>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Opt-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {availableClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-3">
                      <input
                        aria-label={`Seleccionar ${client.name}`}
                        checked={selectedClientIds.includes(client.id)}
                        onChange={() => toggleClient(client.id)}
                        type="checkbox"
                      />
                    </td>
                    <ClientInformation client={client} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section> : null}
    </section>
  );
}
