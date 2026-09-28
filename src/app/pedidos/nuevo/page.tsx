import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { OrderForm } from "@/components/orders/order-form";
import { CaseSourcePreview } from "@/components/cases/case-source-preview";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getOrderFormOptions } from "@/lib/order-service";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { CaseConversationValidationError, getConversationCaseCreationContext } from "@/lib/case-conversation-repository";
import { CASE_TYPE } from "@/lib/case-types";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ contactId?: string | string[]; conversationId?: string | string[]; sourceMessageId?: string | string[]; sourceMessageIds?: string | string[] }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.ORDERS) || !hasPermission(context, WorkspacePermission.ORDER_CREATE)) notFound();
  const [query, contacts] = await Promise.all([searchParams, getOrderFormOptions(context)]);
  const conversationId = typeof query.conversationId === "string" ? query.conversationId : undefined;
  const sourceMessageId = typeof query.sourceMessageId === "string" ? query.sourceMessageId : undefined;
  const sourceMessageIds = query.sourceMessageIds === undefined ? (sourceMessageId ? [sourceMessageId] : []) : [query.sourceMessageIds].flat();
  let origin: Awaited<ReturnType<typeof getConversationCaseCreationContext>> | null = null;
  if (conversationId) {
    try { origin = await getConversationCaseCreationContext(context, CASE_TYPE.ORDER, { conversationId, sourceMessageIds }); }
    catch (error) { if (error instanceof CaseConversationValidationError) notFound(); throw error; }
    if (!origin) notFound();
    if (origin.contactMissing) return <main className="app-page"><Link href={`/bandeja/${conversationId}`} className="text-sm font-semibold text-muted hover:text-foreground">← Volver a la conversación</Link><h1 className="page-heading mt-7">Nuevo pedido</h1><p className="empty-state mt-7">Vinculá o creá un contacto para generar operaciones desde esta conversación.</p></main>;
  }
  const requestedContactId = typeof query.contactId === "string" ? query.contactId : undefined;
  const initialContactId = origin ? origin.conversation.clientId ?? undefined : contacts.some(({ id }) => id === requestedContactId) ? requestedContactId : undefined;
  return <main className="app-page"><Link className="text-sm font-semibold text-muted hover:text-foreground" href={origin ? `/bandeja/${origin.conversation.id}` : "/pedidos"}>← {origin ? "Volver a la conversación" : "Volver a Pedidos"}</Link><p className="eyebrow mt-7">Carga manual</p><h1 className="page-heading">Nuevo pedido</h1><p className="page-description">Guardá un borrador asociado a un contacto visible en tu alcance.</p>{origin ? <CaseSourcePreview messages={origin.sourceMessages} /> : null}{contacts.length ? <OrderForm contacts={contacts} initialContactId={initialContactId} origin={origin ? { conversationId: origin.conversation.id, sourceMessageIds: origin.sourceMessages.map((message) => message.id) } : undefined} /> : <p className="empty-state mt-7">No hay contactos visibles para crear un pedido.</p>}</main>;
}
