import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { OrderForm } from "@/components/orders/order-form";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getOrderFormOptions } from "@/lib/order-service";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ contactId?: string | string[] }> }) {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.ORDERS) || !hasPermission(context, WorkspacePermission.ORDER_CREATE)) notFound();
  const [query, contacts] = await Promise.all([searchParams, getOrderFormOptions(context)]);
  const requestedContactId = typeof query.contactId === "string" ? query.contactId : undefined;
  const initialContactId = contacts.some(({ id }) => id === requestedContactId) ? requestedContactId : undefined;
  return <main className="app-page"><Link className="text-sm font-semibold text-muted hover:text-foreground" href="/pedidos">← Volver a Pedidos</Link><p className="eyebrow mt-7">Carga manual</p><h1 className="page-heading">Nuevo pedido</h1><p className="page-description">Guardá un borrador asociado a un contacto visible en tu alcance.</p>{contacts.length ? <OrderForm contacts={contacts} initialContactId={initialContactId} /> : <p className="empty-state mt-7">No hay contactos visibles para crear un pedido.</p>}</main>;
}
