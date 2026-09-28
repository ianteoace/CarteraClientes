import { ConversationImage } from "@/components/inbox/conversation-image";
import { isEligibleCaseSourceMessage } from "@/lib/case-source-message";
import type { AttachmentPreview } from "@/lib/whatsapp/attachment-types";

export function CaseSourcePreview({ messages }: { messages: Array<{
  id: string; direction: string; type: string; textBody: string | null; createdAt: Date; attachments: AttachmentPreview[];
}> }) {
  if (!messages.length) return null;
  return <section className="mt-5 min-w-0 max-w-3xl border-y border-border py-4" aria-label="Mensajes de origen seleccionados">
    <h2 className="text-sm font-semibold">Origen · WhatsApp · {messages.length} {messages.length === 1 ? "mensaje seleccionado" : "mensajes seleccionados"}</h2>
    <p className="mt-1 text-xs text-muted">Estos mensajes quedarán vinculados a la operación, aunque no aporten texto a la descripción.</p>
    <div className="mt-3 min-w-0 divide-y divide-border">{messages.map((message) => <div className="min-w-0 py-3" key={message.id}>
      <p className="text-xs text-muted">{message.type === "IMAGE" ? "Imagen" : "Texto"} · <time dateTime={message.createdAt.toISOString()}>{message.createdAt.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></p>
      {isEligibleCaseSourceMessage(message) && message.type === "IMAGE" ? <div className="mt-2"><ConversationImage attachment={message.attachments[0]} /></div>
        : <p className="mt-1 whitespace-pre-wrap break-words text-sm">{isEligibleCaseSourceMessage(message) ? message.textBody || "Mensaje de texto" : "Mensaje no disponible"}</p>}
    </div>)}</div>
  </section>;
}
