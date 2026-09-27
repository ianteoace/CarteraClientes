"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { addSelectedContactsToGroupAction, createGroupFromSelectedContactsAction, deleteClientAction, removeSelectedContactsFromGroupAction, updateSelectedContactsAuthorizationAction } from "@/app/clientes/actions";
import { tryNormalizePhone } from "@/lib/phone";
import type { ClientListItem } from "@/lib/client-repository";
import type { GroupListItem } from "@/lib/group-repository";
import { PageHeader } from "@/components/ui/page-header";

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
        (authorizationFilter === "all" || (authorizationFilter === "authorized" ? client.optIn : !client.optIn)) && ([client.name, client.phone, client.email ?? "", client.company ?? "", client.notes ?? ""].some((value) =>
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
    <section className="app-page app-page-wide space-y-5">
      <PageHeader eyebrow="TU CARTERA" title="Contactos" description={`${clients.length} ${clients.length === 1 ? "contacto" : "contactos"} · ${clients.filter((client) => client.optIn).length} autorizados para campañas`} actions={
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
      } />

      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center"><input
        aria-label="Buscar contactos"
        className="field flex-1"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre, teléfono, email o empresa"
        type="search"
        value={query}
      /><select className="field w-full sm:w-48" aria-label="Autorización" onChange={(event) => setAuthorizationFilter(event.target.value)} value={authorizationFilter}><option value="all">Autorización: Todos</option><option value="authorized">Autorizados</option><option value="unauthorized">Sin autorización</option></select><span className="whitespace-nowrap text-xs text-muted">{filteredClients.length} visibles</span></div>

      {error ? (
        <p className="notice-error" role="alert">
          {error}
        </p>
      ) : null}

      {selectedIds.size > 0 ? <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 border border-border bg-white p-3 shadow-[0_8px_24px_-16px_#000]"><strong className="mr-2 whitespace-nowrap text-sm">{selectedIds.size} seleccionados</strong>{permissions.edit ? <select className="field w-auto min-w-36 flex-1 sm:flex-none" aria-label="Autorización seleccionada" defaultValue="" onChange={(event) => { if (event.target.value) updateAuthorization(event.target.value === "authorize"); event.currentTarget.value = ""; }}><option value="">Autorización</option><option value="authorize">Autorizar para campañas</option><option value="remove">Quitar autorización</option></select> : null}{permissions.createCampaign ? <button className="btn-primary" onClick={prepareMessage} type="button">Preparar mensaje</button> : null}{permissions.manageGroups ? <><select className="field w-auto min-w-36 flex-1 sm:flex-none" aria-label="Grupo para la selección" onChange={(event) => setGroupId(event.target.value)} value={groupId}><option value="">Elegir grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button className="btn-secondary" onClick={() => runBulk(addSelectedContactsToGroupAction)} type="button">Agregar</button><button className="btn-secondary" onClick={() => runBulk(removeSelectedContactsFromGroupAction)} type="button">Quitar</button></> : null}{permissions.createGroup && permissions.manageGroups ? <button className="btn-secondary" onClick={createGroupFromSelection} type="button">Crear grupo</button> : null}<button className="btn-quiet" onClick={() => setSelectedIds(new Set())} type="button">Limpiar</button></div> : null}

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
