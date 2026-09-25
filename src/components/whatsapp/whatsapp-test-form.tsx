"use client";

import { FormEvent, useState } from "react";

import {
  sendWhatsAppTestAction,
  type WhatsAppTestResult,
} from "@/app/configuracion/whatsapp/actions";

export function WhatsAppTestForm() {
  const [type, setType] = useState<"template" | "text">("template");
  const [result, setResult] = useState<WhatsAppTestResult>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(undefined);
    setIsSubmitting(true);
    const response = await sendWhatsAppTestAction(new FormData(event.currentTarget));
    setResult(response);
    setIsSubmitting(false);
  }

  return (
    <form className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6" onSubmit={handleSubmit}>
      <h2 className="text-xl font-semibold">Mensaje de prueba</h2>

      <label className="block space-y-1 text-sm font-medium">
        <span>Teléfono destino</span>
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          name="to"
          placeholder="5491112345678"
          required
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipo</legend>
        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              checked={type === "template"}
              name="type"
              onChange={() => setType("template")}
              type="radio"
              value="template"
            />
            Template
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={type === "text"}
              name="type"
              onChange={() => setType("text")}
              type="radio"
              value="text"
            />
            Texto
          </label>
        </div>
      </fieldset>

      {type === "template" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-sm font-medium">
            <span>Nombre del template</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue="hello_world"
              name="templateName"
              required
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Idioma</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue="en_US"
              name="languageCode"
              required
            />
          </label>
        </div>
      ) : (
        <label className="block space-y-1 text-sm font-medium">
          <span>Mensaje</span>
          <textarea
            className="min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2"
            name="text"
            required
          />
        </label>
      )}

      {result ? (
        result.success ? (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            <p>Meta aceptó la solicitud.</p>
            <p>Esto todavía no confirma la entrega al dispositivo.</p>
            <p className="mt-1 break-all">Message ID: {result.messageId}</p>
            <p>Destino: {result.to}</p>
          </div>
        ) : (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <p>{result.error}</p>
            {result.httpStatus ? <p>HTTP: {result.httpStatus}</p> : null}
            {result.metaCode !== undefined ? <p>Código Meta: {result.metaCode}</p> : null}
          </div>
        )
      ) : null}

      <button
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Enviando..." : "Enviar prueba"}
      </button>
    </form>
  );
}
