import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { OrderDetailControls } from "@/components/orders/order-detail-controls";
import { CaseOrigin } from "@/components/cases/case-origin";
import { activityEntityLabel, describeActivity } from "@/lib/activity-presentation";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { isOrderStatus } from "@/lib/case-types";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import { getOrder, getOrderTimeline } from "@/lib/order-service";
import { ORDER_FULFILLMENT_LABELS, ORDER_PAYMENT_LABELS, decimalString, formatOrderMoney, isOrderFulfillmentType, isOrderPaymentStatus } from "@/lib/order-types";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { getCaseOrigin } from "@/lib/case-conversation-repository";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.ORDERS) || !hasPermission(context, WorkspacePermission.ORDER_VIEW)) notFound();
  const number = Number((await params).number);
  const order = await getOrder(context, number);
  if (!order || !isOrderStatus(order.status)) notFound();
  const details = order.orderDetails;
  const paymentStatus = details.paymentStatus;
  const fulfillmentType = details.fulfillmentType;
  if (!isOrderPaymentStatus(paymentStatus) || !isOrderFulfillmentType(fulfillmentType)) notFound();
  const canViewInbox = isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) && hasPermission(context, WorkspacePermission.INBOX_VIEW);
  const [timeline, user, origins] = await Promise.all([getOrderTimeline(context, number), getCurrentUser(), canViewInbox ? getCaseOrigin(context, order.id) : Promise.resolve([])]);

  return <main className="app-page module-page">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/pedidos">← Volver a Pedidos</Link>
    <div className="mt-5"><PageHeader eyebrow={`Pedido #${order.number}`} title={order.title} metadata={`Actualizado ${order.updatedAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}`} actions={<StatusBadge status={order.status}>{ORDER_STATUS_LABELS[order.status]}</StatusBadge>} /></div>
    <div className="document-layout"><div className="document-main">

    <section className="py-6"><SectionHeader title="Items" /><div className="items-heading items-heading-read mt-4"><span>Descripción</span><span>Cantidad</span><span>Unitario</span><span>Subtotal</span></div><div className="mt-4 divide-y divide-border border-y border-border">{order.orderItems.length ? order.orderItems.map((item) => <div className="order-item-read" key={item.id}><span className="font-semibold">{item.description}</span><span>{item.quantity.toString()}</span><span>{formatOrderMoney(item.unitPrice, details.currency)}</span><span className="font-semibold sm:text-right">{formatOrderMoney(item.lineTotal, details.currency)}</span></div>) : <p className="py-4 text-sm text-muted">Borrador sin items.</p>}</div><dl className="money-summary ml-auto mt-4 max-w-xs space-y-2 text-sm"><div className="flex justify-between gap-5"><dt>Subtotal</dt><dd>{formatOrderMoney(details.subtotal, details.currency)}</dd></div><div className="flex justify-between gap-5"><dt>Descuento</dt><dd>{formatOrderMoney(details.discount, details.currency)}</dd></div><div className="flex justify-between gap-5 border-t border-border pt-2 text-base font-bold"><dt>Total</dt><dd>{formatOrderMoney(details.total, details.currency)}</dd></div></dl></section>
    <section><SectionHeader title="Entrega" /><p className="document-copy">{ORDER_FULFILLMENT_LABELS[fulfillmentType]} · {details.fulfillmentNotes ?? "Sin notas de entrega"}</p>{order.description ? <p className="document-copy">{order.description}</p> : null}</section>
    <OrderDetailControls order={{ id: order.id, number: order.number, title: order.title, description: order.description, status: order.status, paymentStatus, fulfillmentType, fulfillmentNotes: details.fulfillmentNotes, discount: decimalString(details.discount) }} items={order.orderItems.map((item) => ({ description: item.description, quantity: item.quantity.toString(), unitPrice: decimalString(item.unitPrice) }))} permissions={{ edit: hasPermission(context, WorkspacePermission.ORDER_EDIT), status: hasPermission(context, WorkspacePermission.ORDER_MANAGE_STATUS), payment: hasPermission(context, WorkspacePermission.ORDER_MANAGE_PAYMENT) }} />
    <CaseOrigin origins={origins} />
    <section className="mt-8 border-t border-border pt-6"><SectionHeader title="Timeline" /><div className="editorial-timeline mt-4">{timeline?.map((activity) => { const actor = activity.actorUserId === user?.id ? (user.name?.trim() || user.email) : activity.actorMember?.acceptedInvitations[0]?.email || (activity.actorUserId ? `Usuario ${activity.actorUserId.slice(0, 8)}…` : "Sistema"); return <article className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_10rem] sm:gap-5" key={activity.id}><p className="truncate text-sm font-semibold">{actor}</p><div><p className="text-sm leading-6">{describeActivity(activity.action, activity.metadata)}</p><p className="text-xs text-muted">{activityEntityLabel(activity.entityType, activity.metadata)}</p></div><time className="text-xs text-muted sm:text-right">{activity.createdAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</time></article>; })}</div></section>
    </div><aside className="document-aside" aria-label="Información contextual"><SectionHeader title="Información" /><dl className="context-section"><dt>Cliente</dt><dd><Link href={`/clientes/${order.contact!.id}`} className="hover:underline">{order.contact!.name}</Link></dd><dd className="text-xs text-muted">{order.contact!.phone}</dd><dt>Estado</dt><dd><StatusBadge status={order.status}>{ORDER_STATUS_LABELS[order.status]}</StatusBadge></dd><dt>Pago</dt><dd><StatusBadge status={paymentStatus}>{ORDER_PAYMENT_LABELS[paymentStatus]}</StatusBadge></dd><dt>Total</dt><dd className="text-xl tabular-nums">{formatOrderMoney(details.total, details.currency)}</dd><dt>Entrega</dt><dd>{ORDER_FULFILLMENT_LABELS[fulfillmentType]}</dd><dt>Actualizado</dt><dd className="text-xs text-muted">{order.updatedAt.toLocaleDateString("es-AR")}</dd></dl><div className="context-section"><SectionHeader title="Origen" />{origins.length ? origins.map((origin) => <Link className="mt-3 block text-xs underline underline-offset-4" key={origin.id} href={`/bandeja/${origin.conversation.id}`}>WhatsApp · Abrir conversación</Link>) : <p className="mt-3 text-xs text-muted">Carga manual</p>}</div></aside></div>
  </main>;
}
