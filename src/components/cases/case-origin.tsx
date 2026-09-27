import Link from "next/link";

type Origin = {
  id: string;
  conversation: { id: string; client: { name: string } | null; externalDisplayName: string | null };
  sourceMessage: { textBody: string | null; direction: string; type: string } | null;
};

export function CaseOrigin({ origins }: { origins: Origin[] }) {
  if (!origins.length) return null;
  return <section className="mt-8 border-t border-border pt-6"><h2 className="eyebrow">Origen</h2><div className="mt-3 divide-y divide-border border-y border-border">{origins.map((origin) => <div className="py-3" key={origin.id}><p className="text-sm font-semibold">WhatsApp · {origin.conversation.client?.name ?? origin.conversation.externalDisplayName ?? "Conversación"}</p><Link className="mt-1 inline-block text-sm underline underline-offset-2" href={`/bandeja/${origin.conversation.id}`}>Abrir conversación</Link>{origin.sourceMessage?.direction === "INBOUND" && origin.sourceMessage.type === "TEXT" && origin.sourceMessage.textBody ? <p className="mt-2 line-clamp-2 text-sm text-muted">{origin.sourceMessage.textBody.slice(0, 240)}</p> : null}</div>)}</div></section>;
}
