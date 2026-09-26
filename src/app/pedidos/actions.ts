"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationRequiredError } from "@/lib/auth/server";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import { CaseValidationError } from "@/lib/case-service";
import {
  OrderValidationError,
  changeOrderStatus,
  changePaymentStatus,
  createOrder,
  replaceOrderItems,
  updateFulfillment,
  updateOrder,
  type OrderItemInput,
} from "@/lib/order-service";
import { WorkspaceModuleError } from "@/lib/workspace-module-service";

export type OrderActionResult = { success: true; number?: number; message?: string } | { success: false; error: string };

function errorResult(error: unknown): OrderActionResult {
  if (error instanceof OrderValidationError || error instanceof CaseValidationError || error instanceof AuthorizationError || error instanceof AuthenticationRequiredError || error instanceof WorkspaceModuleError) return { success: false, error: error.message };
  return { success: false, error: "No se pudo completar la acción. Intentá nuevamente." };
}
function parseItems(value: FormDataEntryValue | null): OrderItemInput[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map((item) => {
      if (!item || typeof item !== "object") throw new Error();
      const record = item as Record<string, unknown>;
      return { description: String(record.description ?? ""), quantity: String(record.quantity ?? ""), unitPrice: String(record.unitPrice ?? "") };
    });
  } catch {
    throw new OrderValidationError("Los items enviados no son válidos.");
  }
}

function refresh(number?: number) {
  revalidatePath("/pedidos");
  revalidatePath("/clientes");
  if (number) revalidatePath(`/pedidos/${number}`);
}

export async function createOrderAction(formData: FormData): Promise<OrderActionResult> {
  try {
    const order = await createOrder(await getAuthorizationContext(), {
      contactId: String(formData.get("contactId") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      items: parseItems(formData.get("items")),
      discount: String(formData.get("discount") ?? "0"),
      fulfillmentType: String(formData.get("fulfillmentType") ?? "PICKUP"),
      fulfillmentNotes: String(formData.get("fulfillmentNotes") ?? ""),
      currency: "ARS",
    });
    if (!order) return { success: false, error: "No se pudo crear el pedido." };
    refresh(order.number);
    return { success: true, number: order.number };
  } catch (error) { return errorResult(error); }
}

export async function updateOrderAction(id: string, number: number, formData: FormData): Promise<OrderActionResult> {
  try {
    const order = await updateOrder(await getAuthorizationContext(), id, { title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? ""), discount: String(formData.get("discount") ?? "0") });
    if (!order) return { success: false, error: "El pedido no existe o está fuera de tu alcance." };
    refresh(number);
    return { success: true, message: "Pedido actualizado." };
  } catch (error) { return errorResult(error); }
}

export async function replaceOrderItemsAction(id: string, number: number, formData: FormData): Promise<OrderActionResult> {
  try {
    const order = await replaceOrderItems(await getAuthorizationContext(), id, parseItems(formData.get("items")), String(formData.get("discount") ?? "0"));
    if (!order) return { success: false, error: "El pedido no existe o está fuera de tu alcance." };
    refresh(number);
    return { success: true, message: "Items y totales actualizados." };
  } catch (error) { return errorResult(error); }
}

export async function changeOrderStatusAction(id: string, number: number, status: string): Promise<OrderActionResult> {
  try {
    const order = await changeOrderStatus(await getAuthorizationContext(), id, status);
    if (!order) return { success: false, error: "El pedido no existe o está fuera de tu alcance." };
    refresh(number);
    return { success: true, message: "Estado actualizado." };
  } catch (error) { return errorResult(error); }
}

export async function changePaymentStatusAction(id: string, number: number, status: string): Promise<OrderActionResult> {
  try {
    const order = await changePaymentStatus(await getAuthorizationContext(), id, status);
    if (!order) return { success: false, error: "El pedido no existe o está fuera de tu alcance." };
    refresh(number);
    return { success: true, message: "Estado de pago actualizado." };
  } catch (error) { return errorResult(error); }
}

export async function updateFulfillmentAction(id: string, number: number, formData: FormData): Promise<OrderActionResult> {
  try {
    const order = await updateFulfillment(await getAuthorizationContext(), id, String(formData.get("fulfillmentType") ?? ""), String(formData.get("fulfillmentNotes") ?? ""));
    if (!order) return { success: false, error: "El pedido no existe o está fuera de tu alcance." };
    refresh(number);
    return { success: true, message: "Entrega actualizada." };
  } catch (error) { return errorResult(error); }
}
