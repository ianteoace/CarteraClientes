"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createOrderAction } from "@/app/pedidos/actions";
import { OrderItemsEditor } from "@/components/orders/order-items-editor";
import { ORDER_FULFILLMENT_LABELS, ORDER_FULFILLMENT_TYPE } from "@/lib/order-types";

type ContactOption = { id: string; name: string; phone: string; email: string | null };

export function OrderForm({ contacts, initialContactId }: { contacts: ContactOption[]; initialContactId?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const visibleContacts = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value ? contacts.filter((contact) => [contact.name, contact.phone, contact.email ?? ""].some((field) => field.toLocaleLowerCase().includes(value))) : contacts;
  }, [contacts, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const result = await createOrderAction(new FormData(event.currentTarget));
      if (!result.success) return setError(result.error);
      router.push(`/pedidos/${result.number}`);
      router.refresh();
    } finally { setPending(false); }
  }

  return <form className="mt-7 max-w-4xl space-y-8" onSubmit={submit}>
    <section className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
      <label className="field-label sm:col-span-2">Buscar contacto<input className="field mt-1" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, teléfono o email" /></label>
      <label className="field-label sm:col-span-2">Contacto *<select className="field mt-1" name="contactId" required value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Seleccioná un contacto</option>{visibleContacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.phone}</option>)}</select></label>
      <label className="field-label sm:col-span-2">Título opcional<input className="field mt-1" maxLength={200} name="title" placeholder="Se genera a partir del contacto si lo dejás vacío" /></label>
      <label className="field-label sm:col-span-2">Descripción<textarea className="field mt-1 min-h-24" maxLength={10000} name="description" /></label>
    </section>
    <OrderItemsEditor />
    <section className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
      <label className="field-label">Entrega<select className="field mt-1" name="fulfillmentType" defaultValue={ORDER_FULFILLMENT_TYPE.PICKUP}>{Object.values(ORDER_FULFILLMENT_TYPE).map((value) => <option value={value} key={value}>{ORDER_FULFILLMENT_LABELS[value]}</option>)}</select></label>
      <label className="field-label sm:col-span-2">Notas de entrega<textarea className="field mt-1 min-h-24" maxLength={2000} name="fulfillmentNotes" /></label>
    </section>
    {error ? <p className="notice-error" role="alert">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={pending || !contactId} type="submit">{pending ? "Guardando…" : "Guardar borrador"}</button><button className="btn-secondary" type="button" onClick={() => router.back()}>Cancelar</button></div>
  </form>;
}
