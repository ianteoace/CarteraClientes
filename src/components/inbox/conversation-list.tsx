import Link from "next/link";

import type { listConversations } from "@/lib/conversation-repository";
import { conversationPreview, maskWhatsAppParticipant } from "@/lib/conversation-presentation";

type ConversationPage = Awaited<ReturnType<typeof listConversations>>;

export function ConversationList({ page, query = "", filter = "all", selectedId }: { page: ConversationPage; query?: string; filter?: "all" | "unread"; selectedId?: string }) {
  const url = (nextFilter: string, nextCursor?: string) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (nextFilter !== "all") search.set("filter", nextFilter);
    if (nextCursor) search.set("cursor", nextCursor);
    return `/bandeja${search.size ? `?${search}` : ""}`;
  };
  return <aside aria-label="Conversaciones" className={`inbox-list inbox-scroll-region ${selectedId ? "inbox-list-hidden-mobile" : ""}`}>
    <div className="inbox-list-header"><p className="eyebrow">MENSAJES</p><h1 className="text-[25px] font-semibold tracking-[-.05em]">Bandeja</h1>
      <form action="/bandeja" className="mt-4 flex gap-2" method="get"><input aria-label="Buscar conversaciones" className="field min-w-0 flex-1" defaultValue={query} name="q" placeholder="Buscar conversación" type="search" />{filter === "unread" ? <input name="filter" type="hidden" value="unread" /> : null}<button aria-label="Buscar" className="btn-secondary" type="submit">⌕</button></form>
      <nav aria-label="Filtrar conversaciones" className="mt-4 flex gap-5 text-xs"><Link aria-current={filter === "all" ? "page" : undefined} className={`border-b-2 pb-2 ${filter === "all" ? "border-foreground font-semibold" : "border-transparent text-muted hover:text-foreground"}`} href={url("all")}>Todos</Link><Link aria-current={filter === "unread" ? "page" : undefined} className={`border-b-2 pb-2 ${filter === "unread" ? "border-foreground font-semibold" : "border-transparent text-muted hover:text-foreground"}`} href={url("unread")}>No leídos</Link></nav>
    </div>
    {page.items.length ? <div>{page.items.map((conversation) => <Link aria-current={selectedId === conversation.id ? "page" : undefined} className={`inbox-row ${selectedId === conversation.id ? "inbox-row-active" : ""}`} href={`/bandeja/${conversation.id}`} key={conversation.id}><span className="flex min-w-0 items-baseline justify-between gap-2"><span className="min-w-0 truncate text-[13px] font-semibold">{conversation.client?.name ?? conversation.externalDisplayName ?? maskWhatsAppParticipant(conversation.externalParticipantId)}</span><time className="shrink-0 text-[10px] tabular-nums text-muted" dateTime={conversation.lastMessageAt.toISOString()}>{conversation.lastMessageAt.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></span><span className="mt-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-muted">{conversationPreview(conversation.lastMessage)}</span>{conversation.unread ? <span aria-label="No leído" className="inbox-unread-indicator size-2 shrink-0 rounded-full bg-foreground" /> : null}</span><span className="inbox-channel-label mt-1 block text-[10px] text-muted">WhatsApp{conversation.client?.company ? ` · ${conversation.client.company}` : ""}{conversation.status === "ARCHIVED" ? " · Archivada" : ""}</span></Link>)}</div> : <p className="px-5 py-8 text-sm text-muted">{filter === "unread" ? "No hay conversaciones sin leer." : "Todavía no hay conversaciones para mostrar."}</p>}
    {page.nextCursor ? <Link className="block border-t border-border px-5 py-4 text-xs font-semibold hover:bg-surface" href={url(filter, page.nextCursor)}>Ver más conversaciones →</Link> : null}
  </aside>;
}
