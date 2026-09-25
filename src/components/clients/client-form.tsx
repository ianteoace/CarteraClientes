"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createClientAction,
  updateClientAction,
} from "@/app/clientes/actions";
import type { ClientListItem } from "@/lib/client-repository";
import type { GroupListItem } from "@/lib/group-repository";

type ClientFormProps = {
  client?: ClientListItem;
  groups: GroupListItem[];
  groupRequired: boolean;
  onClose: () => void;
};

export function ClientForm({ client, groups, groupRequired, onClose }: ClientFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(client);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = client
      ? await updateClientAction(client.id, formData)
      : await createClientAction(formData);

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-10 flex items-center justify-center bg-[#10261d]/35 p-4"
      role="dialog"
      aria-labelledby="client-form-title"
    >
      <form
        className="w-full max-w-md space-y-5 rounded-2xl bg-surface p-6 shadow-[0_20px_60px_-30px_rgba(20,66,50,.5)]"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold" id="client-form-title">
            {isEditing ? "Editar contacto" : "Nuevo contacto"}
          </h2>
          <button
            aria-label="Cerrar formulario"
            className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <label className="block space-y-1 text-sm font-medium">
          <span>Nombre</span>
          <input
            className="field"
            defaultValue={client?.name}
            name="name"
            required
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Teléfono</span>
          <input
            className="field"
            defaultValue={client?.phone}
            name="phone"
            required
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Empresa</span>
          <input
            className="field"
            defaultValue={client?.company ?? ""}
            name="company"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Notas</span>
          <textarea className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={client?.notes ?? ""} maxLength={5000} name="notes" placeholder="Preferencias, contexto o recordatorios personales…" />
          <span className="text-xs font-normal text-zinc-500">Hasta 5000 caracteres. Estas notas son privadas de tu cartera.</span>
        </label>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input defaultChecked={client?.optIn} name="optIn" type="checkbox" />
          Autorizado para campañas
        </label>
        <p className="-mt-3 text-xs text-zinc-500">Solo los contactos autorizados pueden incluirse en campañas nuevas.</p>

        {!isEditing && groups.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Grupos {groupRequired ? "(elegí al menos uno)" : "(opcional)"}</legend>
            <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3">
              {groups.map((group) => (
                <label className="flex items-center gap-2 text-sm" key={group.id}>
                  <input name="groupIds" type="checkbox" value={group.id} />
                  {group.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {!isEditing && groupRequired && groups.length === 0 ? <p className="text-sm text-red-700">Necesitás acceso a un grupo para crear contactos.</p> : null}

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            className="btn-quiet"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={isSubmitting || (!isEditing && groupRequired && groups.length === 0)}
            type="submit"
          >
            {isSubmitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
