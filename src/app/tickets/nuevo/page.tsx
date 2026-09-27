import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

import { TicketForm } from "@/components/tickets/ticket-form";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getTicketFormOptions } from "@/lib/ticket-service";
import { CaseConversationValidationError, getConversationCaseCreationContext } from "@/lib/case-conversation-repository";
import { CASE_TYPE } from "@/lib/case-types";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ contactId?: string | string[]; conversationId?: string | string[]; sourceMessageId?: string | string[] }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS) || !hasPermission(context, WorkspacePermission.TICKET_CREATE)) notFound();
  const [query, options] = await Promise.all([searchParams, getTicketFormOptions(context)]);
  const conversationId = typeof query.conversationId === "string" ? query.conversationId : undefined;
  const sourceMessageId = typeof query.sourceMessageId === "string" ? query.sourceMessageId : undefined;
  let origin: Awaited<ReturnType<typeof getConversationCaseCreationContext>> | null = null;
  if (conversationId) {
    try { origin = await getConversationCaseCreationContext(context, CASE_TYPE.TICKET, { conversationId, sourceMessageId }); }
    catch (error) { if (error instanceof CaseConversationValidationError) notFound(); throw error; }
    if (!origin) notFound();
    if (origin.contactMissing) return <main className="app-page"><Link href={`/bandeja/${conversationId}`} className="text-sm font-semibold text-muted hover:text-foreground">← Volver a la conversación</Link><h1 className="page-heading mt-7">Nuevo ticket</h1><p className="empty-state mt-7">Vinculá o creá un contacto para generar operaciones desde esta conversación.</p></main>;
  }
  const requestedContactId = typeof query.contactId === "string" ? query.contactId : undefined;
  const initialContactId = origin ? origin.conversation.clientId ?? undefined : options.contacts.some(({ id }) => id === requestedContactId) ? requestedContactId : undefined;
  return <main className="app-page"><Link className="text-sm font-semibold text-muted hover:text-foreground" href={origin ? `/bandeja/${origin.conversation.id}` : "/tickets"}>← {origin ? "Volver a la conversación" : "Volver a Tickets"}</Link><p className="eyebrow mt-7">Registro manual</p><h1 className="page-heading">Nuevo ticket</h1><p className="page-description">Registrá una problemática o solicitud de un contacto visible en tu alcance.</p>{options.contacts.length ? <TicketForm contacts={options.contacts} members={options.members} initialContactId={initialContactId} origin={origin ? { conversationId: origin.conversation.id, sourceMessageId: origin.sourceMessage?.id, description: origin.sourceMessage?.textBody?.slice(0, 10000) } : undefined} /> : <p className="empty-state mt-7">No hay contactos visibles para crear un ticket.</p>}</main>;
}
