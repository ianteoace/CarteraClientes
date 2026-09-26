import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { AuthorizationControl } from "@/components/clients/authorization-control";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getClientDetails } from "@/lib/client-repository";
import { getRecentTicketsForContact } from "@/lib/ticket-service";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { getRecentOrdersForContact } from "@/lib/order-service";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import { formatOrderMoney } from "@/lib/order-types";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.CONTACT_VIEW)) notFound();
  const modules = await getWorkspaceModules(context);
  const ticketsEnabled = isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS);
  const ordersEnabled = isModuleEnabled(modules, WORKSPACE_MODULE.ORDERS);
  const { clientId } = await params;
  const [contact, tickets, orders] = await Promise.all([
    getClientDetails(context, clientId),
    ticketsEnabled ? getRecentTicketsForContact(context, clientId) : Promise.resolve([]),
    ordersEnabled ? getRecentOrdersForContact(context, clientId) : Promise.resolve([]),
  ]);
  if (!contact) notFound();
  const canEdit = hasPermission(context, WorkspacePermission.CONTACT_EDIT);
  const canManageGroups = hasPermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  const canCreateTicket = ticketsEnabled && hasPermission(context, WorkspacePermission.TICKET_CREATE);
  const canViewTickets = ticketsEnabled && hasPermission(context, WorkspacePermission.TICKET_VIEW);
  const canCreateOrder = ordersEnabled && hasPermission(context, WorkspacePermission.ORDER_CREATE);
  const canViewOrders = ordersEnabled && hasPermission(context, WorkspacePermission.ORDER_VIEW);

  return <main className="app-page max-w-4xl">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/clientes">← Volver a Contactos</Link>
    <header className="mt-7 border-b border-border pb-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="eyebrow">Contacto</p><h1 className="page-heading">{contact.name}</h1><p className="page-description">Incorporado el {contact.createdAt.toLocaleDateString("es-AR")}</p></div><div className="flex flex-wrap gap-2">{canCreateOrder ? <Link className="btn-primary" href={`/pedidos/nuevo?contactId=${encodeURIComponent(contact.id)}`}>Crear pedido</Link> : null}{canCreateTicket ? <Link className="btn-secondary" href={`/tickets/nuevo?contactId=${encodeURIComponent(contact.id)}`}>Crear ticket</Link> : null}{canEdit ? <Link className="btn-secondary" href="/clientes">Editar contacto</Link> : null}{canManageGroups ? <Link className="btn-secondary" href="/grupos">Administrar grupos</Link> : null}</div></div></header>
    <section className="grid gap-5 border-b border-border py-6 sm:grid-cols-2"><div><p className="eyebrow">Teléfono</p><p className="font-semibold">{contact.phone}</p></div><div><p className="eyebrow">Email</p><p className="font-semibold">{contact.email ?? "Sin email"}</p></div><div><p className="eyebrow">Empresa</p><p className="font-semibold">{contact.company ?? "Sin empresa"}</p></div><div><p className="eyebrow">Autorización</p><AuthorizationControl clientId={contact.id} optIn={contact.optIn} canEdit={canEdit} /></div><div className="sm:col-span-2"><p className="eyebrow">Grupos</p><div className="flex flex-wrap gap-2">{contact.clientGroups.length ? contact.clientGroups.map(({ group }) => <span className="badge-neutral" key={group.id}>{group.name}</span>) : <span className="text-sm text-muted">Sin grupos</span>}</div></div></section>
    <section className="border-b border-border py-6"><h2 className="text-lg font-semibold">Notas</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{contact.notes ?? "Sin notas"}</p></section>
    {canViewOrders ? <section className="py-6"><div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-semibold">Pedidos</h2><Link className="text-sm font-semibold hover:underline" href={`/pedidos?q=${encodeURIComponent(contact.name)}`}>Ver todos</Link></div><div className="mt-3 divide-y divide-border border-y border-border">{orders.length ? orders.map((order) => <Link className="grid gap-1 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:items-center" href={`/pedidos/${order.number}`} key={order.number}><span className="text-sm font-bold">#{order.number}</span><span className="truncate text-sm font-semibold">{ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}</span><span className="text-sm font-semibold sm:text-right">{order.orderDetails ? formatOrderMoney(order.orderDetails.total, order.orderDetails.currency) : "—"}</span></Link>) : <p className="py-4 text-sm text-muted">Este contacto todavía no tiene pedidos.</p>}</div></section> : null}
    {canViewTickets ? <section className="py-6"><div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-semibold">Tickets</h2><Link className="text-sm font-semibold hover:underline" href={`/tickets?contactId=${encodeURIComponent(contact.id)}`}>Ver todos</Link></div><div className="mt-3 divide-y divide-border border-y border-border">{tickets.length ? tickets.map((ticket) => <Link className="grid gap-1 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:items-center" href={`/tickets/${ticket.number}`} key={ticket.number}><span className="text-sm font-bold">#{ticket.number}</span><span className="truncate text-sm font-semibold">{ticket.title}</span><span className="text-sm text-muted sm:text-right">{TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status}</span></Link>) : <p className="py-4 text-sm text-muted">Este contacto todavía no tiene tickets.</p>}</div></section> : null}
  </main>;
}
