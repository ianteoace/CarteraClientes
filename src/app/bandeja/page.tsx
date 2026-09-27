import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { listConversations } from "@/lib/conversation-repository";
import { conversationPreview, maskWhatsAppParticipant } from "@/lib/conversation-presentation";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; cursor?: string }> }) {
  if (!await getCurrentUser()) redirect("/login");
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) || !hasPermission(context, WorkspacePermission.INBOX_VIEW)) notFound();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const filter = params.filter === "unread" ? "unread" : "all";
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const page = await listConversations(context, { search: query, filter, cursor });
  const url = (nextFilter: string, nextCursor?: string) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (nextFilter !== "all") search.set("filter", nextFilter);
    if (nextCursor) search.set("cursor", nextCursor);
    return `/bandeja${search.size ? `?${search}` : ""}`;
  };

  return <main className="app-page max-w-5xl">
    <header className="border-b border-border pb-5"><p className="eyebrow">Conversaciones</p><h1 className="page-heading">Bandeja</h1><p className="page-description">Mensajes de WhatsApp de esta cartera.</p></header>
    <form className="mt-6 flex flex-wrap gap-2" method="get">
      <input aria-label="Buscar conversaciones" className="field min-w-0 flex-1" defaultValue={query} name="q" placeholder="Buscar nombre, teléfono o email" type="search" />
      {filter !== "all" ? <input name="filter" type="hidden" value={filter} /> : null}
      <button className="btn-secondary" type="submit">Buscar</button>
    </form>
    <nav aria-label="Filtrar conversaciones" className="mt-4 flex gap-4 border-b border-border text-sm">
      <Link className={`py-3 ${filter === "all" ? "border-b-2 border-foreground font-semibold" : "text-muted hover:text-foreground"}`} href={url("all")}>Todos</Link>
      <Link className={`py-3 ${filter === "unread" ? "border-b-2 border-foreground font-semibold" : "text-muted hover:text-foreground"}`} href={url("unread")}>No leídos</Link>
    </nav>
    <div className="divide-y divide-border border-b border-border">
      {page.items.length ? page.items.map((conversation) => <Link className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4 transition-colors hover:bg-surface" href={`/bandeja/${conversation.id}`} key={conversation.id}>
        <span className="min-w-0 truncate text-sm font-semibold">{conversation.client?.name ?? conversation.externalDisplayName ?? maskWhatsAppParticipant(conversation.externalParticipantId)}{conversation.unread ? <span aria-label="No leído" className="ml-2 inline-block size-2 rounded-full bg-foreground" /> : null}</span>
        <time className="text-xs text-muted" dateTime={conversation.lastMessageAt.toISOString()}>{conversation.lastMessageAt.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
        <span className="min-w-0 truncate text-sm text-muted">{conversation.client?.company ? `${conversation.client.company} · ` : ""}WhatsApp · {conversationPreview(conversation.lastMessage)}</span>
        {conversation.status === "ARCHIVED" ? <span className="text-xs text-muted">Archivada</span> : null}
      </Link>) : <p className="py-8 text-sm text-muted">{filter === "unread" ? "No hay conversaciones sin leer." : "Todavía no hay conversaciones para mostrar."}</p>}
    </div>
    {page.nextCursor ? <Link className="mt-5 inline-block text-sm font-semibold underline underline-offset-4" href={url(filter, page.nextCursor)}>Ver más conversaciones</Link> : null}
  </main>;
}
