"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  importContactsAction,
  previewContactsImportAction,
} from "@/app/clientes/actions";
import type { ContactImportPreview, ContactImportStatus } from "@/lib/client-import";
import type { GroupListItem } from "@/lib/group-repository";

type ClientImportDialogProps = {
  groups: GroupListItem[];
  groupRequired: boolean;
  onClose: () => void;
};

const statusLabels: Record<ContactImportStatus, string> = {
  READY: "Listo para importar",
  EXISTING_DUPLICATE: "Duplicado existente",
  FILE_DUPLICATE: "Duplicado dentro del archivo",
  INVALID_PHONE: "Teléfono inválido",
  INVALID_EMAIL: "Email inválido",
  INVALID_NAME: "Nombre inválido",
};

export function ClientImportDialog({ groups, groupRequired, onClose }: ClientImportDialogProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ContactImportPreview>();
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string>();
  const [resultMessage, setResultMessage] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);

  async function generatePreview() {
    if (!file) {
      setError("Seleccioná un archivo CSV.");
      return;
    }

    setError(undefined);
    setResultMessage(undefined);
    setIsProcessing(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await previewContactsImportAction(formData);
    setIsProcessing(false);

    if (!result.success) {
      setPreview(undefined);
      setError(result.error);
      return;
    }

    setPreview(result.preview);
  }

  async function importValidContacts() {
    if (!file || !preview || preview.summary.valid === 0) {
      return;
    }
    if (groupRequired && !groupId) {
      setError("Seleccioná un grupo al que tengas acceso.");
      return;
    }

    setError(undefined);
    setIsProcessing(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("groupId", groupId);
    const response = await importContactsAction(formData);
    setIsProcessing(false);

    if (!response.success) {
      setError(response.error);
      return;
    }

    const groupDetail = response.result.groupName
      ? ` Se asignaron al grupo ${response.result.groupName}.`
      : "";
    setResultMessage(
      `${response.result.created} contactos creados; ${response.result.duplicates} duplicados y ${response.result.invalid} inválidos omitidos.${groupDetail}`,
    );
    router.refresh();
  }

  return (
    <div
      aria-labelledby="client-import-title"
      aria-modal="true"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-5 overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="client-import-title">Importar contactos</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Usá un CSV con name, phone y, opcionalmente, company y email. Los contactos importados quedan sin autorización.
            </p>
          </div>
          <button
            aria-label="Cerrar importación"
            className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <label className="block space-y-1 text-sm font-medium">
          <span>Archivo CSV</span>
          <input
            accept=".csv,text/csv"
            className="block w-full text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(undefined);
              setResultMessage(undefined);
            }}
            type="file"
          />
        </label>

        {!preview ? (
          <div className="flex justify-end">
            <button
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={!file || isProcessing}
              onClick={generatePreview}
              type="button"
            >
              {isProcessing ? "Procesando..." : "Ver vista previa"}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <p className="rounded-md bg-zinc-50 p-3">Total: <strong>{preview.summary.total}</strong></p>
              <p className="rounded-md bg-emerald-50 p-3">Válidas: <strong>{preview.summary.valid}</strong></p>
              <p className="rounded-md bg-amber-50 p-3">Duplicadas: <strong>{preview.summary.duplicates}</strong></p>
              <p className="rounded-md bg-red-50 p-3">Inválidas: <strong>{preview.summary.invalid}</strong></p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fila</th>
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Teléfono</th>
                    <th className="px-3 py-2 font-medium">Normalizado</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Empresa</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.name || "—"}</td>
                      <td className="px-3 py-2">{row.phone || "—"}</td>
                      <td className="px-3 py-2">{row.phoneNormalized ?? "—"}</td>
                      <td className="px-3 py-2">{row.email || "—"}</td>
                      <td className="px-3 py-2">{row.company || "—"}</td>
                      <td className="px-3 py-2">{statusLabels[row.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="block space-y-1 text-sm font-medium">
              <span>Agregar contactos importados al grupo {groupRequired ? "(obligatorio)" : "(opcional)"}</span>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                onChange={(event) => setGroupId(event.target.value)}
                value={groupId}
              >
                <option value="">{groupRequired ? "Seleccioná un grupo" : "Sin grupo"}</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>

            <div className="flex justify-end gap-3">
              <button
                className="rounded-md px-4 py-2 text-sm font-medium hover:bg-zinc-100"
                disabled={isProcessing}
                onClick={() => setPreview(undefined)}
                type="button"
              >
                Elegir otro archivo
              </button>
              <button
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={preview.summary.valid === 0 || isProcessing || (groupRequired && !groupId)}
                onClick={importValidContacts}
                type="button"
              >
                {isProcessing ? "Importando..." : "Importar contactos válidos"}
              </button>
            </div>
          </>
        )}

        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
        {resultMessage ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultMessage}</p> : null}
      </div>
    </div>
  );
}
