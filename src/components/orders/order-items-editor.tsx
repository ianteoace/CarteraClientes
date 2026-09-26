"use client";

import { useMemo, useState } from "react";

export type EditableOrderItem = { description: string; quantity: string; unitPrice: string };

function amount(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(value);
}

export function OrderItemsEditor({ initialItems = [], initialDiscount = "0" }: { initialItems?: EditableOrderItem[]; initialDiscount?: string }) {
  const [items, setItems] = useState<EditableOrderItem[]>(initialItems);
  const [discount, setDiscount] = useState(initialDiscount);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + amount(item.quantity) * amount(item.unitPrice), 0), [items]);
  const total = Math.max(subtotal - amount(discount), 0);

  function update(index: number, field: keyof EditableOrderItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  return <section className="space-y-4">
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <div className="flex items-baseline justify-between gap-3"><div><h2 className="text-lg font-semibold">Items</h2><p className="text-xs text-muted">Los importes definitivos se calculan al guardar.</p></div><button className="btn-secondary" type="button" onClick={() => setItems((current) => [...current, { description: "", quantity: "1", unitPrice: "0" }])}>Agregar item</button></div>
    <div className="divide-y divide-border border-y border-border">
      {items.map((item, index) => <div className="grid gap-3 py-4 md:grid-cols-[minmax(12rem,1fr)_7rem_10rem_6rem] md:items-end" key={index}>
        <label className="field-label">Descripción<input className="field mt-1" maxLength={300} required name={`item-description-${index}`} value={item.description} onChange={(event) => update(index, "description", event.target.value)} /></label>
        <label className="field-label">Cantidad<input className="field mt-1" inputMode="decimal" required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => update(index, "quantity", event.target.value)} /></label>
        <label className="field-label">Precio unitario<input className="field mt-1" inputMode="decimal" required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => update(index, "unitPrice", event.target.value)} /></label>
        <button className="btn-quiet min-h-10" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button>
      </div>)}
      {!items.length ? <p className="py-4 text-sm text-muted">Podés guardar el borrador sin items y completarlo después.</p> : null}
    </div>
    <div className="grid gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,20rem)] sm:items-end">
      <label className="field-label sm:col-start-2">Descuento<input className="field mt-1" name="discount" inputMode="decimal" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
      <dl className="space-y-2 border-t border-border pt-3 text-sm sm:col-start-2"><div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div className="flex justify-between gap-4"><dt>Descuento</dt><dd>{money(amount(discount))}</dd></div><div className="flex justify-between gap-4 text-base font-bold"><dt>Total</dt><dd>{money(total)}</dd></div></dl>
    </div>
  </section>;
}
