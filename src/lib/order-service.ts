import "server-only";

import { Prisma, WorkspacePermission } from "@prisma/client";

import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { getClientScopeFilter, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { changeCaseStatusInTransaction, createCaseInTransaction, updateCaseCoreInTransaction } from "@/lib/case-service";
import { CASE_TYPE, ORDER_STATUS, canTransitionOrderStatus, isOrderStatus } from "@/lib/case-types";
import {
  findOrderById,
  findOrderByNumber,
  findOrderTimeline,
  findOrders,
  listOrderContacts,
  listRecentOrdersForContact,
} from "@/lib/order-repository";
import {
  ORDER_FULFILLMENT_TYPE,
  ORDER_PAYMENT_STATUS,
  isOrderFulfillmentType,
  isOrderPaymentStatus,
  isSupportedCurrency,
} from "@/lib/order-types";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

const MAX_ITEM_DESCRIPTION = 300;
const MAX_FULFILLMENT_NOTES = 2_000;
const PAGE_SIZE = 30;
const ITEM_EDITABLE_STATUSES = new Set([ORDER_STATUS.DRAFT, ORDER_STATUS.CONFIRMED]);
const FULFILLMENT_EDITABLE_STATUSES = new Set([ORDER_STATUS.DRAFT, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING]);

export class OrderValidationError extends Error {}

export type OrderItemInput = { description: string; quantity: string | number; unitPrice: string | number };
export type CreateOrderInput = {
  contactId: string;
  title?: string | null;
  description?: string | null;
  items?: OrderItemInput[];
  discount?: string | number;
  currency?: string;
  fulfillmentType?: string;
  fulfillmentNotes?: string | null;
};

function decimal(value: string | number | Prisma.Decimal, label: string, scale: number) {
  try {
    const parsed = new Prisma.Decimal(value === "" ? "NaN" : value);
    if (!parsed.isFinite() || parsed.decimalPlaces() > scale) throw new Error();
    return parsed;
  } catch {
    throw new OrderValidationError(`${label} no es válido.`);
  }
}

function normalizeDiscount(value: string | number | undefined) {
  const result = decimal(value ?? 0, "El descuento", 2);
  if (result.isNegative()) throw new OrderValidationError("El descuento no puede ser negativo.");
  return result;
}

function normalizeFulfillmentNotes(value?: string | null) {
  const notes = value?.trim() ?? "";
  if (notes.length > MAX_FULFILLMENT_NOTES) throw new OrderValidationError(`Las notas de entrega no pueden superar ${MAX_FULFILLMENT_NOTES} caracteres.`);
  return notes || null;
}

function normalizeItems(items: readonly OrderItemInput[] = []) {
  return items.map((item, position) => {
    const description = item.description.trim();
    if (!description) throw new OrderValidationError(`El item ${position + 1} necesita una descripción.`);
    if (description.length > MAX_ITEM_DESCRIPTION) throw new OrderValidationError(`La descripción del item ${position + 1} es demasiado larga.`);
    const quantity = decimal(item.quantity, `La cantidad del item ${position + 1}`, 3);
    const unitPrice = decimal(item.unitPrice, `El precio del item ${position + 1}`, 2);
    if (quantity.lessThanOrEqualTo(0)) throw new OrderValidationError("La cantidad debe ser mayor que cero.");
    if (unitPrice.isNegative()) throw new OrderValidationError("El precio unitario no puede ser negativo.");
    return { description, quantity, unitPrice, lineTotal: quantity.mul(unitPrice).toDecimalPlaces(2), position };
  });
}

function totals(items: ReturnType<typeof normalizeItems>, discount: Prisma.Decimal) {
  const subtotal = items.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  return { subtotal, discount, total: Prisma.Decimal.max(subtotal.sub(discount), 0).toDecimalPlaces(2) };
}

type OrderRecord = Awaited<ReturnType<typeof findOrderById>>;
type ValidOrder = NonNullable<OrderRecord> & {
  contactId: string;
  orderDetails: NonNullable<NonNullable<OrderRecord>["orderDetails"]>;
};

function ensureOrderShape(order: OrderRecord): ValidOrder | null {
  return order && order.type === CASE_TYPE.ORDER && order.orderDetails && order.contactId ? order as ValidOrder : null;
}

async function guard(context: AuthorizationContext, permission: WorkspacePermission) {
  await requireModule(context, WORKSPACE_MODULE.ORDERS);
  requirePermission(context, permission);
}

async function lockCase(transaction: Prisma.TransactionClient, context: AuthorizationContext, id: string) {
  await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Case" WHERE "id" = ${id} AND "workspaceId" = ${context.workspaceId} FOR UPDATE`);
}

export async function createOrder(context: AuthorizationContext, input: CreateOrderInput) {
  await guard(context, WorkspacePermission.ORDER_CREATE);
  const contactId = input.contactId.trim();
  if (!contactId) throw new OrderValidationError("Seleccioná un contacto.");
  const currency = input.currency ?? "ARS";
  if (!isSupportedCurrency(currency)) throw new OrderValidationError("La moneda no está soportada.");
  const fulfillmentType = input.fulfillmentType ?? ORDER_FULFILLMENT_TYPE.PICKUP;
  if (!isOrderFulfillmentType(fulfillmentType)) throw new OrderValidationError("El tipo de entrega no es válido.");
  const normalizedItems = normalizeItems(input.items);
  const calculated = totals(normalizedItems, normalizeDiscount(input.discount));

  return prisma.$transaction(async (transaction) => {
    const contact = await transaction.client.findFirst({ where: { id: contactId, ...getClientScopeFilter(context) }, select: { id: true, name: true } });
    if (!contact) throw new OrderValidationError("El contacto no pertenece a esta cartera o está fuera de tu alcance.");
    const created = await createCaseInTransaction(context, {
      type: CASE_TYPE.ORDER,
      contactId,
      title: input.title?.trim() || `Pedido de ${contact.name}`,
      description: input.description,
      status: ORDER_STATUS.DRAFT,
      priority: null,
    }, transaction);
    await transaction.orderDetails.create({ data: {
      caseId: created.id,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      fulfillmentType,
      fulfillmentNotes: normalizeFulfillmentNotes(input.fulfillmentNotes),
      currency,
      ...calculated,
    } });
    if (normalizedItems.length) await transaction.orderItem.createMany({ data: normalizedItems.map((item) => ({ ...item, orderCaseId: created.id })) });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: created.id, action: ACTIVITY_ACTION.ORDER_ITEMS_UPDATED, metadata: { type: CASE_TYPE.ORDER, number: created.number, itemCount: normalizedItems.length, total: calculated.total.toFixed(2), currency } }, transaction);
    return findOrderById(context, created.id, transaction);
  }, { maxWait: 20_000, timeout: 30_000 });
}

export async function listOrders(context: AuthorizationContext, input: { query?: string; status?: string; paymentStatus?: string; page?: number } = {}) {
  await guard(context, WorkspacePermission.ORDER_VIEW);
  if (input.status && !isOrderStatus(input.status)) throw new OrderValidationError("El estado del pedido no es válido.");
  if (input.paymentStatus && !isOrderPaymentStatus(input.paymentStatus)) throw new OrderValidationError("El estado de pago no es válido.");
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? Math.min(input.page!, 1_000) : 1;
  const result = await findOrders(context, { ...input, page, pageSize: PAGE_SIZE });
  return { ...result, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(result.total / PAGE_SIZE)) };
}

export async function getOrder(context: AuthorizationContext, number: number) {
  await guard(context, WorkspacePermission.ORDER_VIEW);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return ensureOrderShape(await findOrderByNumber(context, number));
}

export async function updateOrder(context: AuthorizationContext, id: string, input: { title: string; description?: string | null; discount?: string | number }) {
  await guard(context, WorkspacePermission.ORDER_EDIT);
  return prisma.$transaction(async (transaction) => {
    await lockCase(transaction, context, id);
    const order = ensureOrderShape(await findOrderById(context, id, transaction));
    if (!order) return null;
    if (!ITEM_EDITABLE_STATUSES.has(order.status as typeof ORDER_STATUS.DRAFT)) throw new OrderValidationError("Este pedido ya no permite editar sus datos económicos.");
    await updateCaseCoreInTransaction(context, id, { title: input.title, description: input.description }, transaction);
    if (input.discount !== undefined) {
      const discount = normalizeDiscount(input.discount);
      await transaction.orderDetails.update({ where: { caseId: id }, data: { discount, total: Prisma.Decimal.max(order.orderDetails.subtotal.sub(discount), 0).toDecimalPlaces(2) } });
    }
    return findOrderById(context, id, transaction);
  });
}

export async function replaceOrderItems(context: AuthorizationContext, id: string, items: OrderItemInput[], discount?: string | number) {
  await guard(context, WorkspacePermission.ORDER_EDIT);
  const normalizedItems = normalizeItems(items);
  return prisma.$transaction(async (transaction) => {
    await lockCase(transaction, context, id);
    const order = ensureOrderShape(await findOrderById(context, id, transaction));
    if (!order) return null;
    if (!ITEM_EDITABLE_STATUSES.has(order.status as typeof ORDER_STATUS.DRAFT)) throw new OrderValidationError("Los items solo pueden editarse en pedidos borrador o confirmados.");
    const calculated = totals(normalizedItems, discount === undefined ? order.orderDetails.discount : normalizeDiscount(discount));
    await transaction.orderItem.deleteMany({ where: { orderCaseId: id } });
    if (normalizedItems.length) await transaction.orderItem.createMany({ data: normalizedItems.map((item) => ({ ...item, orderCaseId: id })) });
    await transaction.orderDetails.update({ where: { caseId: id }, data: calculated });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: id, action: ACTIVITY_ACTION.ORDER_ITEMS_UPDATED, metadata: { type: CASE_TYPE.ORDER, number: order.number, itemCount: normalizedItems.length, total: calculated.total.toFixed(2), currency: order.orderDetails.currency } }, transaction);
    return findOrderById(context, id, transaction);
  });
}

export async function changeOrderStatus(context: AuthorizationContext, id: string, nextStatus: string) {
  await guard(context, WorkspacePermission.ORDER_MANAGE_STATUS);
  if (!isOrderStatus(nextStatus)) throw new OrderValidationError("El estado del pedido no es válido.");
  return prisma.$transaction(async (transaction) => {
    await lockCase(transaction, context, id);
    const order = ensureOrderShape(await findOrderById(context, id, transaction));
    if (!order) return null;
    if (!isOrderStatus(order.status) || !canTransitionOrderStatus(order.status, nextStatus)) throw new OrderValidationError("Esa transición de estado no está permitida.");
    if (nextStatus === ORDER_STATUS.CONFIRMED && order.orderItems.length === 0) throw new OrderValidationError("Agregá al menos un item antes de confirmar el pedido.");
    await changeCaseStatusInTransaction(context, id, nextStatus, transaction);
    return findOrderById(context, id, transaction);
  });
}

export async function changePaymentStatus(context: AuthorizationContext, id: string, nextStatus: string) {
  await guard(context, WorkspacePermission.ORDER_MANAGE_PAYMENT);
  if (!isOrderPaymentStatus(nextStatus)) throw new OrderValidationError("El estado de pago no es válido.");
  return prisma.$transaction(async (transaction) => {
    await lockCase(transaction, context, id);
    const order = ensureOrderShape(await findOrderById(context, id, transaction));
    if (!order) return null;
    if (order.orderDetails.paymentStatus === nextStatus) return order;
    await transaction.orderDetails.update({ where: { caseId: id }, data: { paymentStatus: nextStatus } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: id, action: ACTIVITY_ACTION.ORDER_PAYMENT_STATUS_CHANGED, metadata: { type: CASE_TYPE.ORDER, number: order.number, from: order.orderDetails.paymentStatus, to: nextStatus } }, transaction);
    return findOrderById(context, id, transaction);
  });
}

export async function updateFulfillment(context: AuthorizationContext, id: string, fulfillmentType: string, fulfillmentNotes?: string | null) {
  await guard(context, WorkspacePermission.ORDER_EDIT);
  if (!isOrderFulfillmentType(fulfillmentType)) throw new OrderValidationError("El tipo de entrega no es válido.");
  const notes = normalizeFulfillmentNotes(fulfillmentNotes);
  return prisma.$transaction(async (transaction) => {
    await lockCase(transaction, context, id);
    const order = ensureOrderShape(await findOrderById(context, id, transaction));
    if (!order) return null;
    if (!FULFILLMENT_EDITABLE_STATUSES.has(order.status as typeof ORDER_STATUS.DRAFT)) throw new OrderValidationError("Este pedido ya no permite cambiar la entrega.");
    if (order.orderDetails.fulfillmentType === fulfillmentType && order.orderDetails.fulfillmentNotes === notes) return order;
    await transaction.orderDetails.update({ where: { caseId: id }, data: { fulfillmentType, fulfillmentNotes: notes } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: id, action: ACTIVITY_ACTION.ORDER_FULFILLMENT_UPDATED, metadata: { type: CASE_TYPE.ORDER, number: order.number, fulfillmentType } }, transaction);
    return findOrderById(context, id, transaction);
  });
}

export async function getOrderFormOptions(context: AuthorizationContext) {
  await guard(context, WorkspacePermission.ORDER_CREATE);
  return listOrderContacts(context);
}

export async function getOrderTimeline(context: AuthorizationContext, number: number) {
  const order = await getOrder(context, number);
  return order ? findOrderTimeline(context, order.id) : null;
}

export async function getRecentOrdersForContact(context: AuthorizationContext, contactId: string) {
  await requireModule(context, WORKSPACE_MODULE.ORDERS);
  if (!hasPermission(context, WorkspacePermission.ORDER_VIEW)) return [];
  return listRecentOrdersForContact(context, contactId);
}
