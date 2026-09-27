"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { sendConversationReplyAction } from "@/app/bandeja/actions";
import { WHATSAPP_TEXT_LIMIT } from "@/lib/whatsapp/service-window";

export function ReplyComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  async function submit() {
    if (pending || !body.trim()) return;
    setPending(true);
    setError("");
    try {
      const result = await sendConversationReplyAction(conversationId, body, requestId);
      if (!result.success) {
        setError(result.error);
        // Si Meta aceptó una intención fallida o ambigua, la misma clave nunca reenvía.
        router.refresh();
        return;
      }
      setBody("");
      setRequestId(crypto.randomUUID());
      router.refresh();
    } catch {
      setError("No pudimos confirmar el envío. Revisá la conversación antes de volver a intentar.");
      router.refresh();
    } finally { setPending(false); }
  }

  return <div className="border-t border-border bg-background py-4">
    <p className="inbox-channel-label mb-2 text-xs text-muted">Podés responder por WhatsApp · solo texto</p>
    <div className="flex items-end gap-2">
      <textarea aria-label="Respuesta de WhatsApp" className="field inbox-composer-input min-h-12 min-w-0 flex-1 resize-y" maxLength={WHATSAPP_TEXT_LIMIT} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Escribí tu respuesta" rows={2} value={body} />
      <button className="btn-primary shrink-0" disabled={pending || !body.trim()} onClick={() => void submit()} type="button">{pending ? "Enviando…" : "Enviar"}</button>
    </div>
    {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
  </div>;
}
