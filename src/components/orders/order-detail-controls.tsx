"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  changeOrderStatusAction,
  changePaymentStatusAction,
  replaceOrderItemsAction,
  updateFulfillmentAction,
  updateOrderAction,
  type OrderActionResult,
} from "@/app/pedidos/actions";
import { OrderItemsEditor, type EditableOrderItem } from "@/components/orders/order-items-editor";
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/case-types";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import {
  ORDER_FULFILLMENT_LABELS,
  ORDER_FULFILLMENT_TYPE,
  ORDER_PAYMENT_LABELS,
  ORDER_PAYMENT_STATUS,
  type OrderFulfillmentType,
  type OrderPaymentStatus,
} from "@/lib/order-types";

export function OrderDetailControls({ order, items, permissions }: {
  order: {
    id: string; number: number; title: string; description: string | null; status: OrderStatus;
    paymentStatus: OrderPaymentStatus; fulfillmentType: OrderFulfillmentType; fulfillmentNotes: string | null; discount: string;
  };
  items: EditableOrderItem[];
  permissions: { edit: boolean; status: boolean; payment: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<OrderActionResult | null>(null);
  const itemsEditable = permissions.edit && (order.status === "DRAFT" || order.status === "CONFIRMED");
  const fulfillmentEditable = permissions.edit && ["DRAFT", "CONFIRMED", "PREPARING"].includes(order.status);

  function run(operation: () => Promise<OrderActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      setNotice(result);
      if (result.success) router.refresh();
    });
  }

  function submitForm(event: FormEvent<HTMLFormElement>, operation: (form: FormData) => Promise<OrderActionResult>) {
    event.preventDefault();
    run(() => operation(new FormData(event.currentTarget)));
  }

  return <div className="mt-8 space-y-8">
    {notice ? <p className={notice.success ? "notice-success" : "notice-error"} role="status">{notice.success ? notice.message ?? "Cambios guardados." : notice.error}</p> : null}

    {permissions.edit && (order.status === "DRAFT" || order.status === "CONFIRMED") ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Datos del pedido</h2><form className="mt-4 grid gap-4" onSubmit={(event) => submitForm(event, (form) => updateOrderAction(order.id, order.number, form))}><label className="field-label">Título<input className="field mt-1" defaultValue={order.title} maxLength={200} name="title" required /></label><label className="field-label">Descripción<textarea className="field mt-1 min-h-24" defaultValue={order.description ?? ""} maxLength={10000} name="description" /></label><input name="discount" type="hidden" value={order.discount} /><div><button className="btn-secondary" disabled={pending} type="submit">Guardar datos</button></div></form></section> : null}

    {itemsEditable ? <section className="border-t border-border pt-6"><form onSubmit={(event) => submitForm(event, (form) => replaceOrderItemsAction(order.id, order.number, form))}><OrderItemsEditor initialItems={items} initialDiscount={order.discount} /><button className="btn-secondary mt-5" disabled={pending} type="submit">Guardar items y totales</button></form></section> : null}

    {fulfillmentEditable ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Entrega</h2><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => submitForm(event, (form) => updateFulfillmentAction(order.id, order.number, form))}><label className="field-label">Tipo<select className="field mt-1" defaultValue={order.fulfillmentType} name="fulfillmentType">{Object.values(ORDER_FULFILLMENT_TYPE).map((value) => <option value={value} key={value}>{ORDER_FULFILLMENT_LABELS[value]}</option>)}</select></label><label className="field-label sm:col-span-2">Notas<textarea className="field mt-1 min-h-24" defaultValue={order.fulfillmentNotes ?? ""} maxLength={2000} name="fulfillmentNotes" /></label><div><button className="btn-secondary" disabled={pending} type="submit">Guardar entrega</button></div></form></section> : null}

    {permissions.status && ORDER_STATUS_TRANSITIONS[order.status].length ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Estado</h2><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); const status = String(new FormData(event.currentTarget).get("status") ?? ""); run(() => changeOrderStatusAction(order.id, order.number, status)); }}><label className="field-label min-w-56">Próximo estado<select className="field mt-1" required defaultValue="" name="status"><option disabled value="">Elegí una transición</option>{ORDER_STATUS_TRANSITIONS[order.status].map((value) => <option value={value} key={value}>{ORDER_STATUS_LABELS[value]}</option>)}</select></label><button className="btn-primary" disabled={pending} type="submit">Cambiar estado</button></form></section> : null}

    {permissions.payment ? <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">Pago administrativo</h2><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); const status = String(new FormData(event.currentTarget).get("paymentStatus") ?? ""); run(() => changePaymentStatusAction(order.id, order.number, status)); }}><label className="field-label min-w-56">Estado de pago<select className="field mt-1" defaultValue={order.paymentStatus} name="paymentStatus">{Object.values(ORDER_PAYMENT_STATUS).map((value) => <option value={value} key={value}>{ORDER_PAYMENT_LABELS[value]}</option>)}</select></label><button className="btn-secondary" disabled={pending} type="submit">Actualizar pago</button></form></section> : null}
  </div>;
}
