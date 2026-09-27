import Link from "next/link";

type Origin = {
  id: string;
  conversation: { id: string; client: { name: string } | null; externalDisplayName: string | null };
  sourceMessages: { messageId: string; message: { textBody: string | null; direction: string; type: string; createdAt: Date; sentAt: Date | null } }[];
};

export function CaseOrigin({ origins }: { origins: Origin[] }) {
  if (!origins.length) return null;
  return <section className="mt-8 border-t border-border pt-6">
    <h2 className="eyebrow">Origen</h2>
    <div className="mt-3 divide-y divide-border border-y border-border">{origins.map((origin) => <div className="py-3" key={origin.id}>
      <p className="text-sm font-semibold">WhatsApp · {origin.conversation.client?.name ?? origin.conversation.externalDisplayName ?? "Conversación"}</p>
      <Link className="mt-1 inline-block text-sm underline underline-offset-2" href={`/bandeja/${origin.conversation.id}`}>Abrir conversación</Link>
      {origin.sourceMessages.length ? <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">{origin.sourceMessages.length} {origin.sourceMessages.length === 1 ? "mensaje de origen" : "mensajes de origen"}</summary>
        <div className="mt-3 divide-y divide-border border-y border-border">{origin.sourceMessages.map(({ messageId, message }) => <div className="py-3" key={messageId}>
          <p className="text-xs text-muted">Cliente · {(message.sentAt ?? message.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{message.direction === "INBOUND" && message.type === "TEXT" ? message.textBody || "Mensaje de texto" : "Mensaje no disponible"}</p>
        </div>)}</div>
      </details> : null}
    </div>)}</div>
  </section>;
}
