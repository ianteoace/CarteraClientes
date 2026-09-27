import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { ArchiveControl, ContactAssociation } from "@/components/inbox/conversation-controls";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasAllGroups, hasPermission } from "@/lib/authorization";
import { getConversationDetails, listLinkableClients, markConversationRead } from "@/lib/conversation-repository";
import { maskWhatsAppParticipant, messageStatusLabel } from "@/lib/conversation-presentation";
import { listGroups } from "@/lib/group-repository";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ before?: string; linkSearch?: string }>;
}) {
  if (!await getCurrentUser()) redirect("/login");
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) || !hasPermission(context, WorkspacePermission.INBOX_VIEW)) notFound();
  const { conversationId } = await params;
  const query = await searchParams;
  const conversation = await getConversationDetails(context, conversationId, query.before);
  if (!conversation) notFound();
  await markConversationRead(context, conversationId);
  const canManage = hasPermission(context, WorkspacePermission.INBOX_MANAGE);
  const canLink = canManage && hasPermission(context, WorkspacePermission.CONTACT_VIEW);
  const canCreate = canManage && hasPermission(context, WorkspacePermission.CONTACT_CREATE);
  const linkSearch = typeof query.linkSearch === "string" ? query.linkSearch : "";
  const [contacts, groups] = await Promise.all([
    !conversation.clientId && canLink ? listLinkableClients(context, linkSearch) : Promise.resolve([]),
    !conversation.clientId && canCreate && hasPermission(context, WorkspacePermission.GROUP_VIEW) ? listGroups(context) : Promise.resolve([]),
  ]);
  const name = conversation.client?.name ?? conversation.externalDisplayName ?? maskWhatsAppParticipant(conversation.externalParticipantId);
  return <main className="app-page max-w-5xl">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/bandeja">← Volver a Bandeja</Link>
    <header className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div className="min-w-0"><p className="eyebrow">WhatsApp</p><h1 className="page-heading break-words">{name}</h1><p className="page-description">{maskWhatsAppParticipant(conversation.externalParticipantId)}{conversation.client?.company ? ` · ${conversation.client.company}` : ""}</p>{conversation.status === "ARCHIVED" ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Archivada</p> : null}</div><div className="flex flex-wrap gap-2">{conversation.client && hasPermission(context, WorkspacePermission.CONTACT_VIEW) ? <Link className="btn-secondary" href={`/clientes/${conversation.client.id}`}>Ver contacto</Link> : null}{canManage ? <ArchiveControl archived={conversation.status === "ARCHIVED"} conversationId={conversation.id} /> : null}</div></header>
    {!conversation.clientId && (canLink || canCreate) ? <>
      {canLink ? <form className="mt-5 flex flex-wrap gap-2" method="get"><input aria-label="Buscar contacto para vincular" className="field min-w-0 flex-1" defaultValue={linkSearch} name="linkSearch" placeholder="Buscar contacto existente" type="search" /><button className="btn-secondary" type="submit">Buscar</button></form> : null}
      <ContactAssociation conversationId={conversation.id} participantId={conversation.externalParticipantId} displayName={conversation.externalDisplayName} contacts={contacts} groups={groups} groupRequired={!hasAllGroups(context)} canLink={canLink} canCreate={canCreate} />
    </> : null}
    <section aria-label="Mensajes" className="space-y-3 py-6">
      {conversation.olderCursor ? <Link className="inline-block text-sm font-semibold underline underline-offset-4" href={`/bandeja/${conversation.id}?before=${encodeURIComponent(conversation.olderCursor)}`}>Ver mensajes anteriores</Link> : null}
      {conversation.messages.map((message) => <article className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`} key={message.id}><div className={`max-w-[88%] min-w-0 border px-4 py-3 text-sm sm:max-w-[70%] ${message.direction === "OUTBOUND" ? "border-foreground bg-foreground text-white" : "border-border bg-surface"}`}>
        <p className="whitespace-pre-wrap break-words">{message.type === "TEXT" ? message.textBody || "Mensaje de texto" : message.type === "TEMPLATE" ? "Mensaje de plantilla" : "Mensaje no compatible todavía."}</p>
        <div className={`mt-2 flex flex-wrap gap-2 text-xs ${message.direction === "OUTBOUND" ? "text-zinc-300" : "text-muted"}`}><time dateTime={(message.sentAt ?? message.createdAt).toISOString()}>{(message.sentAt ?? message.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>{message.direction === "OUTBOUND" ? <span>· {messageStatusLabel(message.status)}</span> : null}</div>
      </div></article>)}
      {!conversation.messages.length ? <p className="text-sm text-muted">Todavía no hay mensajes en esta conversación.</p> : null}
    </section>
  </main>;
}
