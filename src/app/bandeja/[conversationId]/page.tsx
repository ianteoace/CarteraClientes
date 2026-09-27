import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { ArchiveControl, ContactAssociation } from "@/components/inbox/conversation-controls";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ReplyComposer } from "@/components/inbox/reply-composer";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasAllGroups, hasPermission } from "@/lib/authorization";
import { getConversationDetails, listConversations, listLinkableClients, markConversationRead } from "@/lib/conversation-repository";
import { listConversationCases } from "@/lib/case-conversation-repository";
import { maskWhatsAppParticipant, messageStatusLabel } from "@/lib/conversation-presentation";
import { listGroups } from "@/lib/group-repository";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { getWhatsAppServiceWindow } from "@/lib/whatsapp/service-window";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ before?: string; linkSearch?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) || !hasPermission(context, WorkspacePermission.INBOX_VIEW)) notFound();
  const { conversationId } = await params;
  const query = await searchParams;
  const conversation = await getConversationDetails(context, conversationId, query.before);
  if (!conversation) notFound();
  await markConversationRead(context, conversationId);
  const canManage = hasPermission(context, WorkspacePermission.INBOX_MANAGE);
  const canReply = hasPermission(context, WorkspacePermission.INBOX_REPLY);
  const windowOpen = getWhatsAppServiceWindow(conversation.lastInboundAt).open;
  const canLink = canManage && hasPermission(context, WorkspacePermission.CONTACT_VIEW);
  const canCreate = canManage && hasPermission(context, WorkspacePermission.CONTACT_CREATE);
  const canCreateTicket = isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS) && hasPermission(context, WorkspacePermission.TICKET_CREATE);
  const canCreateOrder = isModuleEnabled(modules, WORKSPACE_MODULE.ORDERS) && hasPermission(context, WorkspacePermission.ORDER_CREATE);
  const linkSearch = typeof query.linkSearch === "string" ? query.linkSearch : "";
  const [contacts, groups, relatedCases, conversationPage] = await Promise.all([
    !conversation.clientId && canLink ? listLinkableClients(context, linkSearch) : Promise.resolve([]),
    !conversation.clientId && canCreate && hasPermission(context, WorkspacePermission.GROUP_VIEW) ? listGroups(context) : Promise.resolve([]),
    listConversationCases(context, conversation.id),
    listConversations(context, {}),
  ]);
  const name = conversation.client?.name ?? conversation.externalDisplayName ?? maskWhatsAppParticipant(conversation.externalParticipantId);
  return <main className="app-page inbox-page"><div className="inbox-frame"><ConversationList page={conversationPage} selectedId={conversation.id} /><div className="inbox-thread"><div className="inbox-thread-header-wrap">
    <Link className="inbox-back-link text-xs font-semibold text-muted hover:text-foreground lg:hidden" href="/bandeja">← Volver a Bandeja</Link>
    <header className="inbox-thread-header flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 pb-4 pt-4 max-md:px-4"><div className="min-w-0"><p className="inbox-channel-label eyebrow">WhatsApp</p><h1 className="break-words text-xl font-semibold tracking-[-.04em]">{name}</h1><p className="mt-1 text-xs text-muted">{maskWhatsAppParticipant(conversation.externalParticipantId)}{conversation.client?.company ? ` · ${conversation.client.company}` : ""}</p>{conversation.status === "ARCHIVED" ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Archivada</p> : null}</div><div className="flex flex-wrap gap-2">{conversation.client && hasPermission(context, WorkspacePermission.CONTACT_VIEW) ? <Link className="btn-secondary" href={`/clientes/${conversation.client.id}`}>Ver contacto</Link> : null}{canManage ? <ArchiveControl archived={conversation.status === "ARCHIVED"} conversationId={conversation.id} /> : null}</div></header>
  </div><div className="inbox-thread-scroll inbox-scroll-region">
    {!conversation.clientId && (canLink || canCreate) ? <>
      {canLink ? <form className="mt-5 flex flex-wrap gap-2" method="get"><input aria-label="Buscar contacto para vincular" className="field min-w-0 flex-1" defaultValue={linkSearch} name="linkSearch" placeholder="Buscar contacto existente" type="search" /><button className="btn-secondary" type="submit">Buscar</button></form> : null}
      <ContactAssociation conversationId={conversation.id} participantId={conversation.externalParticipantId} displayName={conversation.externalDisplayName} contacts={contacts} groups={groups} groupRequired={!hasAllGroups(context)} canLink={canLink} canCreate={canCreate} />
    </> : null}
    {(canCreateTicket || canCreateOrder) ? <section className="border-b border-border py-5"><h2 className="eyebrow">Acciones</h2>{conversation.clientId ? <div className="mt-3 flex flex-wrap gap-2">{canCreateTicket ? <Link className="btn-secondary" href={`/tickets/nuevo?conversationId=${encodeURIComponent(conversation.id)}`}>Crear ticket</Link> : null}{canCreateOrder ? <Link className="btn-secondary" href={`/pedidos/nuevo?conversationId=${encodeURIComponent(conversation.id)}`}>Crear pedido</Link> : null}</div> : <p className="mt-2 text-sm text-muted">Vinculá o creá un contacto para generar operaciones desde esta conversación.</p>}</section> : null}
    {relatedCases.length ? <section className="border-b border-border py-5"><h2 className="eyebrow">Operaciones</h2><div className="mt-3 divide-y divide-border border-y border-border">{relatedCases.map(({ id, case: related }) => <Link className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:underline" href={related.type === "TICKET" ? `/tickets/${related.number}` : `/pedidos/${related.number}`} key={id}><span className="min-w-0"><strong>{related.type === "TICKET" ? "Ticket" : "Pedido"} #{related.number}</strong> · {related.title}</span><span className="text-muted">{related.type === "TICKET" ? TICKET_STATUS_LABELS[related.status as keyof typeof TICKET_STATUS_LABELS] ?? related.status : ORDER_STATUS_LABELS[related.status as keyof typeof ORDER_STATUS_LABELS] ?? related.status}</span></Link>)}</div></section> : null}
    <section aria-label="Mensajes" className="inbox-message-list py-6">
      {conversation.olderCursor ? <Link className="inline-block text-sm font-semibold underline underline-offset-4" href={`/bandeja/${conversation.id}?before=${encodeURIComponent(conversation.olderCursor)}`}>Ver mensajes anteriores</Link> : null}
      {conversation.messages.map((message) => <article className={`message-item flex ${message.direction === "OUTBOUND" ? "inbox-message-outbound justify-end" : "inbox-message-inbound justify-start"}`} key={message.id}><div className="inbox-message-bubble max-w-[88%] min-w-0 border px-3 py-2.5 text-sm sm:max-w-[68%]">
        <p className="whitespace-pre-wrap break-words">{message.type === "TEXT" ? message.textBody || "Mensaje de texto" : message.type === "TEMPLATE" ? "Mensaje de plantilla" : "Mensaje no compatible todavía."}</p>
        <div className={`inbox-message-meta mt-2 flex flex-wrap gap-2 text-xs ${message.direction === "OUTBOUND" ? "" : "text-muted"}`}><time dateTime={(message.sentAt ?? message.createdAt).toISOString()}>{(message.sentAt ?? message.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>{message.direction === "OUTBOUND" ? <span className={message.status === "FAILED" ? "text-danger" : message.status === "READ" ? "inbox-status-read" : ""}>· {messageStatusLabel(message.status)}</span> : null}{message.direction === "OUTBOUND" && message.sentByUserId ? <span title={message.sentByUserId === user.id ? "Enviado desde tu cuenta" : "Enviado por un integrante del equipo"}>· Enviado por {message.sentByUserId === user.id ? (user.name || user.email || "vos") : (message.sentByMemberId ? conversation.actorLabels[message.sentByMemberId] : null) ?? "integrante del equipo"}</span> : null}</div>
        {conversation.clientId && message.direction === "INBOUND" && message.type === "TEXT" && (canCreateTicket || canCreateOrder) ? <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{canCreateTicket ? <Link className="underline underline-offset-2" href={`/tickets/nuevo?conversationId=${encodeURIComponent(conversation.id)}&sourceMessageId=${encodeURIComponent(message.id)}`}>Crear ticket desde este mensaje</Link> : null}{canCreateOrder ? <Link className="underline underline-offset-2" href={`/pedidos/nuevo?conversationId=${encodeURIComponent(conversation.id)}&sourceMessageId=${encodeURIComponent(message.id)}`}>Crear pedido desde este mensaje</Link> : null}</div> : null}
      </div></article>)}
      {!conversation.messages.length ? <p className="text-sm text-muted">Todavía no hay mensajes en esta conversación.</p> : null}
    </section>
    </div><div className="inbox-composer">{canReply && conversation.status === "OPEN" && windowOpen ? <ReplyComposer conversationId={conversation.id} /> :
      canReply && conversation.status === "ARCHIVED" ? <p className="border-t border-border py-4 text-sm text-muted">Reabrí la conversación para responder.</p> :
      canReply && !windowOpen ? <p className="border-t border-border py-4 text-sm text-muted">La ventana de atención de WhatsApp finalizó. Para volver a iniciar la conversación necesitás una plantilla. Plantillas próximamente.</p> : null}</div></div></div></main>;
}
