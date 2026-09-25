"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { addSelectedContactsToGroupAction, createGroupFromSelectedContactsAction, deleteClientAction, removeSelectedContactsFromGroupAction, updateSelectedContactsAuthorizationAction } from "@/app/clientes/actions";
import { tryNormalizePhone } from "@/lib/phone";
import type { ClientListItem } from "@/lib/client-repository";
import type { GroupListItem } from "@/lib/group-repository";

import { ClientForm } from "./client-form";
import { ClientImportDialog } from "./client-import-dialog";
import { ClientsTable } from "./clients-table";

type ClientsManagerProps = {
  clients: ClientListItem[];
  groups: GroupListItem[];
  permissions: { create: boolean; edit: boolean; delete: boolean; manageGroups: boolean; createGroup: boolean; createCampaign: boolean; groupRequired: boolean };
};

export function ClientsManager({ clients, groups, permissions }: ClientsManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState("");
  const [authorizationFilter, setAuthorizationFilter] = useState("all");

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const normalizedPhoneQuery = tryNormalizePhone(query);

    if (!normalizedQuery) {
      return clients.filter((client) => authorizationFilter === "all" || (authorizationFilter === "authorized" ? client.optIn : !client.optIn));
    }

    return clients.filter(
      (client) =>
        (authorizationFilter === "all" || (authorizationFilter === "authorized" ? client.optIn : !client.optIn)) && ([client.name, client.phone, client.company ?? "", client.notes ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ) ||
        (normalizedPhoneQuery !== null &&
          client.phoneNormalized.includes(normalizedPhoneQuery))),
    );
  }, [clients, query, authorizationFilter]);

  function openNewClientForm() {
    setSelectedClient(null);
    setError(undefined);
    setIsFormOpen(true);
  }

  function toggleSelected(id: string) { setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleVisible() { setSelectedIds((current) => { const next = new Set(current); const allSelected = filteredClients.every((client) => next.has(client.id)); filteredClients.forEach((client) => allSelected ? next.delete(client.id) : next.add(client.id)); return next; }); }
  async function runBulk(action: (groupId: string, ids: string[]) => Promise<{ success: boolean; message?: string; error?: string }>) { if (!groupId) { setError("Seleccioná un grupo."); return; } const result = await action(groupId, [...selectedIds]); if (result.success) { setError(result.message); setSelectedIds(new Set()); router.refresh(); } else setError(result.error); }
  async function createGroupFromSelection() { const name = window.prompt("Nombre del grupo"); if (!name) return; const description = window.prompt("Descripción opcional") ?? ""; const result = await createGroupFromSelectedContactsAction(name, description, [...selectedIds]); if (result.success) { setError(result.message); setSelectedIds(new Set()); router.refresh(); } else setError(result.error); }

  function openEditClientForm(client: ClientListItem) {
    setSelectedClient(client);
    setError(undefined);
    setIsFormOpen(true);
  }

  function prepareMessage() {
    sessionStorage.setItem("manual-campaign-contact-ids", JSON.stringify([...selectedIds]));
    router.push("/campanas/nueva?manual=1");
  }
  async function updateAuthorization(optIn: boolean) { const result = await updateSelectedContactsAuthorizationAction([...selectedIds], optIn); if (result.success) { setError(result.message); setSelectedIds(new Set()); router.refresh(); } else setError(result.error); }

  async function handleDelete(client: ClientListItem) {
    const shouldDelete = window.confirm(
      `¿Eliminar a ${client.name}? Esta acción no se puede deshacer.`,
    );

    if (!shouldDelete) {
      return;
    }

    setError(undefined);
    const result = await deleteClientAction(client.id);

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
          <p className="eyebrow">Tu cartera</p>
          <h1 className="page-heading">Contactos</h1>
          <p className="page-description">
            {clients.length} {clients.length === 1 ? "contacto" : "contactos"} · {clients.filter((client) => client.optIn).length} autorizados para campañas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.create ? <>
          <button
            className="btn-secondary"
            onClick={() => setIsImportOpen(true)}
            type="button"
          >
            Importar contactos
          </button>
          <button
            className="btn-primary"
            onClick={openNewClientForm}
            type="button"
          >
            Agregar contacto
          </button>
          </> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-y border-border py-3 sm:flex-row"><input
        aria-label="Buscar contactos"
        className="field flex-1"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre, teléfono o empresa"
        type="search"
        value={query}
      /><select className="rounded-md border border-zinc-300 px-3 py-2 text-sm" aria-label="Autorización" onChange={(event) => setAuthorizationFilter(event.target.value)} value={authorizationFilter}><option value="all">Autorización: Todos</option><option value="authorized">Autorizados</option><option value="unauthorized">Sin autorización</option></select></div>

      {error ? (
        <p className="notice-error" role="alert">
          {error}
        </p>
      ) : null}

      {selectedIds.size > 0 ? <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"><strong className="mr-2 text-sm">{selectedIds.size} seleccionados</strong>{permissions.edit ? <select className="rounded-md border border-zinc-300 px-2 py-2 text-sm" aria-label="Autorización seleccionada" defaultValue="" onChange={(event) => { if (event.target.value) updateAuthorization(event.target.value === "authorize"); event.currentTarget.value = ""; }}><option value="">Autorización</option><option value="authorize">Autorizar para campañas</option><option value="remove">Quitar autorización</option></select> : null}{permissions.createCampaign ? <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white" onClick={prepareMessage} type="button">Preparar mensaje</button> : null}{permissions.manageGroups ? <><select className="rounded-md border border-zinc-300 px-2 py-2 text-sm" onChange={(event) => setGroupId(event.target.value)} value={groupId}><option value="">Elegir grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button className="rounded-md border px-3 py-2 text-sm" onClick={() => runBulk(addSelectedContactsToGroupAction)} type="button">Agregar a grupo</button><button className="rounded-md border px-3 py-2 text-sm" onClick={() => runBulk(removeSelectedContactsFromGroupAction)} type="button">Quitar de grupo</button></> : null}{permissions.createGroup && permissions.manageGroups ? <button className="rounded-md border px-3 py-2 text-sm" onClick={createGroupFromSelection} type="button">Crear grupo</button> : null}<button className="px-3 py-2 text-sm" onClick={() => setSelectedIds(new Set())} type="button">Limpiar</button></div> : null}

      <ClientsTable
        clients={filteredClients}
        onDelete={handleDelete}
        onEdit={openEditClientForm}
        onToggle={toggleSelected}
        onToggleVisible={toggleVisible}
        selectedIds={selectedIds}
        canEdit={permissions.edit}
        canDelete={permissions.delete}
        canSelect={permissions.edit || permissions.manageGroups || permissions.createCampaign}
      />

      {isFormOpen ? (
        <ClientForm
          client={selectedClient ?? undefined}
          groups={groups}
          groupRequired={permissions.groupRequired}
          onClose={() => setIsFormOpen(false)}
        />
      ) : null}

      {isImportOpen ? <ClientImportDialog groups={groups} groupRequired={permissions.groupRequired} onClose={() => setIsImportOpen(false)} /> : null}
    </section>
  );
}
