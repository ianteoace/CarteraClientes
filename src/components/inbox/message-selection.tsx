"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Selection = { active: boolean; selected: Set<string>; toggle: (id: string) => void; setActive: (active: boolean) => void; clear: () => void };
const SelectionContext = createContext<Selection | null>(null);

export function MessageSelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value = useMemo<Selection>(() => ({
    active, selected, setActive: (next) => { setActive(next); if (!next) setSelected(new Set()); },
    toggle: (id) => setSelected((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else if (next.size < 50) next.add(id); return next; }),
    clear: () => { setSelected(new Set()); setActive(false); },
  }), [active, selected]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Message selection requires a provider");
  return value;
}

export function MessageSelectionActions({ conversationId, canCreateTicket, canCreateOrder }: { conversationId: string; canCreateTicket: boolean; canCreateOrder: boolean }) {
  const selection = useSelection();
  const router = useRouter();
  if (!canCreateTicket && !canCreateOrder) return null;
  function create(kind: "tickets" | "pedidos") {
    const params = new URLSearchParams({ conversationId });
    for (const id of selection.selected) params.append("sourceMessageIds", id);
    router.push(`/${kind}/nuevo?${params.toString()}`);
  }
  if (!selection.active) return <button className="btn-secondary" type="button" onClick={() => selection.setActive(true)}>Seleccionar mensajes</button>;
  return <div className="inbox-selection-actions" role="group" aria-label="Acciones para mensajes seleccionados">
    <span className="text-xs font-semibold">{selection.selected.size} {selection.selected.size === 1 ? "mensaje seleccionado" : "mensajes seleccionados"}</span>
    {canCreateTicket ? <button className="btn-secondary" disabled={!selection.selected.size} onClick={() => create("tickets")} type="button">Crear ticket</button> : null}
    {canCreateOrder ? <button className="btn-secondary" disabled={!selection.selected.size} onClick={() => create("pedidos")} type="button">Crear pedido</button> : null}
    <button className="btn-secondary" onClick={selection.clear} type="button">Cancelar</button>
  </div>;
}

export function SelectableMessage({ id, eligible, outbound, children }: { id: string; eligible: boolean; outbound: boolean; children: ReactNode }) {
  const selection = useSelection();
  const selected = selection.selected.has(id);
  return <article className={`message-item flex ${outbound ? "inbox-message-outbound justify-end" : "inbox-message-inbound justify-start"}${selected ? " inbox-message-selected" : ""}`}>
    {selection.active && eligible ? <label className="inbox-message-select" aria-label="Seleccionar mensaje">
      <input type="checkbox" checked={selected} onChange={() => selection.toggle(id)} aria-label="Seleccionar mensaje como origen" />
    </label> : null}
    {children}
  </article>;
}
