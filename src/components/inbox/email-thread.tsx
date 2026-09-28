import Link from "next/link";
import { ArchiveControl, ContactAssociation } from "@/components/inbox/conversation-controls";
import type { getConversationDetails, listLinkableClients } from "@/lib/conversation-repository";

type Conversation = NonNullable<Awaited<ReturnType<typeof getConversationDetails>>>;
type Props = {
  conversation: Conversation;
  canManage: boolean;
  canLink: boolean;
  canCreate: boolean;
  canViewContact: boolean;
  groupRequired: boolean;
  linkSearch: string;
  contacts: Awaited<ReturnType<typeof listLinkableClients>>;
  groups: { id: string; name: string }[];
};

export function EmailThread({ conversation, canManage, canLink, canCreate, canViewContact, groupRequired, linkSearch, contacts, groups }: Props) {
  const name = conversation.client?.name ?? conversation.externalDisplayName ?? conversation.externalParticipantId;
  return <div className="inbox-thread inbox-email">
    <div className="inbox-thread-header-wrap">
      <Link className="inbox-back-link text-xs font-semibold text-muted hover:text-foreground lg:hidden" href="/bandeja">← Volver a Bandeja</Link>
      <header className="inbox-thread-header flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 pb-4 pt-4 max-md:px-4">
        <div className="min-w-0"><p className="inbox-channel-label eyebrow">Email</p><h1 className="break-words text-xl font-semibold tracking-[-.04em]">{name}</h1><p className="mt-1 break-all text-xs text-muted">{conversation.externalParticipantId}{conversation.client?.company ? ` · ${conversation.client.company}` : ""}</p><p className="mt-3 break-words text-sm font-semibold">{conversation.subject || "Sin asunto"}</p>{conversation.status === "ARCHIVED" ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Archivada</p> : null}</div>
        {canManage ? <ArchiveControl archived={conversation.status === "ARCHIVED"} conversationId={conversation.id} /> : null}
      </header>
    </div>
    <div className="inbox-action-bar">
      {conversation.clientId && canViewContact ? <Link className="btn-secondary" href={`/clientes/${conversation.clientId}`}>Ver contacto</Link> : null}
      {!conversation.clientId && (canLink || canCreate) ? <div className="inbox-contact-tools">
        {canLink ? <form action={`/bandeja/${conversation.id}`} className="inbox-link-search" method="get"><input aria-label="Buscar contacto para vincular" className="field min-w-0 flex-1" defaultValue={linkSearch} name="linkSearch" placeholder="Buscar contacto existente" type="search" /><button className="btn-secondary" type="submit">Buscar</button></form> : null}
        <ContactAssociation channel="EMAIL" conversationId={conversation.id} participantId={conversation.externalParticipantId} displayName={conversation.externalDisplayName} contacts={contacts} groups={groups} groupRequired={groupRequired} canLink={canLink} canCreate={canCreate} />
      </div> : null}
    </div>
    <div className="inbox-thread-scroll inbox-scroll-region">
      <section aria-label="Emails" className="email-message-list py-6">
        {conversation.olderCursor ? <Link className="inline-block pb-4 text-sm font-semibold underline underline-offset-4" href={`/bandeja/${conversation.id}?before=${encodeURIComponent(conversation.olderCursor)}`}>Ver mensajes anteriores</Link> : null}
        {conversation.emailMessages.map((message) => <article className="email-message py-5" key={message.id}>
          <header className="mb-4 flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-semibold">{message.fromName ?? message.fromAddress}</p>{message.fromName ? <p className="mt-1 break-all text-xs text-muted">{message.fromAddress}</p> : null}<p className="mt-2 break-words text-xs text-muted">{message.subject}</p></div><time className="shrink-0 text-xs text-muted" dateTime={message.receivedAt.toISOString()}>{message.receivedAt.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></header>
          <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{message.textBody?.trim() || "Contenido de email no disponible en texto."}</p>
          {message.attachmentCount > 0 ? <p className="mt-5 text-xs text-muted">Este email contiene archivos adjuntos. Soporte próximamente.</p> : null}
        </article>)}
        {!conversation.emailMessages.length ? <p className="text-sm text-muted">Todavía no hay emails en esta conversación.</p> : null}
      </section>
    </div>
    <footer className="inbox-composer"><p className="py-4 text-xs text-muted">Las respuestas por email se habilitarán en el próximo paso.</p></footer>
  </div>;
}
