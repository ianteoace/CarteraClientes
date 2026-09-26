import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { ORDER_STATUS, isOrderStatus } from "@/lib/case-types";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import { listOrders } from "@/lib/order-service";
import { ORDER_FULFILLMENT_LABELS, ORDER_PAYMENT_LABELS, ORDER_PAYMENT_STATUS, formatOrderMoney, isOrderFulfillmentType, isOrderPaymentStatus } from "@/lib/order-types";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

function pageHref(filters: { query?: string; status?: string; paymentStatus?: string }, page: number) {
  const query = new URLSearchParams();
  if (filters.query) query.set("q", filters.query);
  if (filters.status) query.set("estado", filters.status);
  if (filters.paymentStatus) query.set("pago", filters.paymentStatus);
  if (page > 1) query.set("pagina", String(page));
  return `/pedidos?${query}`;
}
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.ORDERS) || !hasPermission(context, WorkspacePermission.ORDER_VIEW)) notFound();
  const query = await searchParams;
  const filters = {
    query: typeof query.q === "string" ? query.q : undefined,
    status: typeof query.estado === "string" ? query.estado : undefined,
    paymentStatus: typeof query.pago === "string" ? query.pago : undefined,
  };
  const result = await listOrders(context, { ...filters, page: typeof query.pagina === "string" ? Number(query.pagina) : 1 });

  return <main className="app-page">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Operación</p><h1 className="page-heading">Pedidos</h1><p className="page-description">{result.total} {result.total === 1 ? "pedido" : "pedidos"}</p></div>{hasPermission(context, WorkspacePermission.ORDER_CREATE) ? <Link className="btn-primary" href="/pedidos/nuevo">Nuevo pedido</Link> : null}</div>
    <form className="mt-7 grid gap-2 border-y border-border py-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(2,minmax(10rem,auto))_auto]" method="get"><input className="field" defaultValue={filters.query} name="q" placeholder="Número, título, contacto, teléfono o email" type="search" /><select className="field" defaultValue={filters.status ?? ""} name="estado"><option value="">Todos los estados</option>{Object.values(ORDER_STATUS).map((status) => <option value={status} key={status}>{ORDER_STATUS_LABELS[status]}</option>)}</select><select className="field" defaultValue={filters.paymentStatus ?? ""} name="pago"><option value="">Todos los pagos</option>{Object.values(ORDER_PAYMENT_STATUS).map((status) => <option value={status} key={status}>{ORDER_PAYMENT_LABELS[status]}</option>)}</select><button className="btn-secondary" type="submit">Filtrar</button></form>
    {result.items.length ? <div className="divide-y divide-border border-b border-border"><div className="hidden grid-cols-[4rem_minmax(10rem,1fr)_8rem_8rem_9rem_8rem_8rem] gap-4 bg-surface px-3 py-2 text-xs font-semibold text-muted lg:grid"><span>#</span><span>Cliente</span><span>Estado</span><span>Pago</span><span>Total</span><span>Entrega</span><span>Actualizado</span></div>{result.items.map((order) => {
      const details = order.orderDetails;
      return <Link className="grid gap-2 px-3 py-4 transition hover:bg-surface lg:grid-cols-[4rem_minmax(10rem,1fr)_8rem_8rem_9rem_8rem_8rem] lg:items-center lg:gap-4" href={`/pedidos/${order.number}`} key={order.id}><span className="text-sm font-bold">#{order.number}</span><span className="min-w-0"><strong className="block truncate text-sm">{order.contact?.name ?? "Contacto eliminado"}</strong><span className="block truncate text-xs text-muted">{order.title}</span></span><span className="text-sm">{isOrderStatus(order.status) ? ORDER_STATUS_LABELS[order.status] : order.status}</span><span className="text-sm">{details && isOrderPaymentStatus(details.paymentStatus) ? ORDER_PAYMENT_LABELS[details.paymentStatus] : "—"}</span><span className="text-sm font-semibold">{details ? formatOrderMoney(details.total, details.currency) : "—"}</span><span className="text-sm text-muted">{details && isOrderFulfillmentType(details.fulfillmentType) ? ORDER_FULFILLMENT_LABELS[details.fulfillmentType] : "—"}</span><time className="text-xs text-muted">{order.updatedAt.toLocaleDateString("es-AR")}</time></Link>;
    })}</div> : <div className="empty-state mt-7"><p>Todavía no hay pedidos.</p>{hasPermission(context, WorkspacePermission.ORDER_CREATE) ? <Link className="btn-primary mt-4" href="/pedidos/nuevo">Nuevo pedido</Link> : null}</div>}
    {result.pageCount > 1 ? <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación">{result.page > 1 ? <Link className="btn-secondary" href={pageHref(filters, result.page - 1)}>Anterior</Link> : <span />}<span className="text-muted">Página {result.page} de {result.pageCount}</span>{result.page < result.pageCount ? <Link className="btn-secondary" href={pageHref(filters, result.page + 1)}>Siguiente</Link> : <span />}</nav> : null}
  </main>;
}
