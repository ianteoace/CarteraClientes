"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createGroupAction, updateGroupAction } from "@/app/grupos/actions";
import type { GroupListItem } from "@/lib/group-repository";

type GroupFormProps = {
  group?: GroupListItem;
  onClose: () => void;
};

export function GroupForm({ group, onClose }: GroupFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(group);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = group
      ? await updateGroupAction(group.id, formData)
      : await createGroupAction(formData);

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
      aria-labelledby="group-form-title"
      aria-modal="true"
      className="fixed inset-0 z-10 flex items-center justify-center bg-[#10261d]/35 p-4"
      role="dialog"
    >
      <form
        className="w-full max-w-md space-y-5 rounded-2xl bg-surface p-6 shadow-[0_20px_60px_-30px_rgba(20,66,50,.5)]"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold" id="group-form-title">
            {isEditing ? "Editar grupo" : "Nuevo grupo"}
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
            defaultValue={group?.name}
            name="name"
            required
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Descripción</span>
          <textarea
            className="field min-h-24"
            defaultValue={group?.description ?? ""}
            name="description"
          />
        </label>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            className="rounded-md px-4 py-2 text-sm font-medium hover:bg-zinc-100"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
