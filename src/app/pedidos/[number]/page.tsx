import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { OrderDetailControls } from "@/components/orders/order-detail-controls";
import { activityEntityLabel, describeActivity } from "@/lib/activity-presentation";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { isOrderStatus } from "@/lib/case-types";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import { getOrder, getOrderTimeline } from "@/lib/order-service";
import { ORDER_FULFILLMENT_LABELS, ORDER_PAYMENT_LABELS, decimalString, formatOrderMoney, isOrderFulfillmentType, isOrderPaymentStatus } from "@/lib/order-types";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

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
  const [timeline, user] = await Promise.all([getOrderTimeline(context, number), getCurrentUser()]);

  return <main className="app-page max-w-5xl">
    <Link className="text-sm font-semibold text-muted hover:text-foreground" href="/pedidos">← Volver a Pedidos</Link>
    <header className="mt-7 border-b border-border pb-6"><p className="eyebrow">Pedido #{order.number}</p><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-heading">{order.title}</h1><p className="page-description">Actualizado {order.updatedAt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="flex flex-wrap gap-2"><span className="badge-neutral">{ORDER_STATUS_LABELS[order.status]}</span><span className="badge-neutral">{ORDER_PAYMENT_LABELS[paymentStatus]}</span><strong className="text-xl">{formatOrderMoney(details.total, details.currency)}</strong></div></div></header>
    <section className="grid gap-6 border-b border-border py-6 sm:grid-cols-2"><div><p className="eyebrow">Cliente</p><Link className="font-semibold hover:underline" href={`/clientes/${order.contact!.id}`}>{order.contact!.name}</Link><p className="mt-1 text-sm text-muted">{order.contact!.phone}</p>{order.contact!.email ? <p className="text-sm text-muted">{order.contact!.email}</p> : null}</div><div><p className="eyebrow">Entrega</p><p className="font-semibold">{ORDER_FULFILLMENT_LABELS[fulfillmentType]}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{details.fulfillmentNotes ?? "Sin notas de entrega"}</p></div></section>
    <section className="py-6"><h2 className="text-lg font-semibold">Items</h2><div className="mt-4 divide-y divide-border border-y border-border">{order.orderItems.length ? order.orderItems.map((item) => <div className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(12rem,1fr)_7rem_10rem_10rem] sm:gap-4" key={item.id}><span className="font-semibold">{item.description}</span><span>{item.quantity.toString()}</span><span>{formatOrderMoney(item.unitPrice, details.currency)}</span><span className="font-semibold sm:text-right">{formatOrderMoney(item.lineTotal, details.currency)}</span></div>) : <p className="py-4 text-sm text-muted">Borrador sin items.</p>}</div><dl className="ml-auto mt-4 max-w-xs space-y-2 text-sm"><div className="flex justify-between gap-5"><dt>Subtotal</dt><dd>{formatOrderMoney(details.subtotal, details.currency)}</dd></div><div className="flex justify-between gap-5"><dt>Descuento</dt><dd>{formatOrderMoney(details.discount, details.currency)}</dd></div><div className="flex justify-between gap-5 border-t border-border pt-2 text-base font-bold"><dt>Total</dt><dd>{formatOrderMoney(details.total, details.currency)}</dd></div></dl></section>
    <OrderDetailControls order={{ id: order.id, number: order.number, title: order.title, description: order.description, status: order.status, paymentStatus, fulfillmentType, fulfillmentNotes: details.fulfillmentNotes, discount: decimalString(details.discount) }} items={order.orderItems.map((item) => ({ description: item.description, quantity: item.quantity.toString(), unitPrice: decimalString(item.unitPrice) }))} permissions={{ edit: hasPermission(context, WorkspacePermission.ORDER_EDIT), status: hasPermission(context, WorkspacePermission.ORDER_MANAGE_STATUS), payment: hasPermission(context, WorkspacePermission.ORDER_MANAGE_PAYMENT) }} />
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-lg font-semibold">Timeline</h2><div className="mt-4 divide-y divide-border border-y border-border">{timeline?.map((activity) => { const actor = activity.actorUserId === user?.id ? (user.name?.trim() || user.email) : activity.actorMember?.acceptedInvitations[0]?.email || (activity.actorUserId ? `Usuario ${activity.actorUserId.slice(0, 8)}…` : "Sistema"); return <article className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_10rem] sm:gap-5" key={activity.id}><p className="truncate text-sm font-semibold">{actor}</p><div><p className="text-sm leading-6">{describeActivity(activity.action, activity.metadata)}</p><p className="text-xs text-muted">{activityEntityLabel(activity.entityType, activity.metadata)}</p></div><time className="text-xs text-muted sm:text-right">{activity.createdAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</time></article>; })}</div></section>
  </main>;
}
