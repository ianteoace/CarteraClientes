"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

const links = [
  { label: "Mi cartera", href: "/", icon: "home" },
  { label: "Bandeja", href: "/bandeja", icon: "inbox", visible: "inbox" },
  { label: "Contactos", href: "/clientes", icon: "people", visible: "contacts" },
  { label: "Grupos", href: "/grupos", icon: "grid", visible: "groups" },
  { label: "Campañas", href: "/campanas", icon: "send", visible: "campaigns" },
  { label: "Pedidos", href: "/pedidos", icon: "order", visible: "orders" },
  { label: "Tickets", href: "/tickets", icon: "ticket", visible: "tickets" },
  { label: "Incidencias", href: "/incidencias", icon: "alert", visible: "incidents" },
  { label: "Actividad", href: "/actividad", icon: "activity", visible: "activity", section: "admin" },
  { label: "Equipo", href: "/equipo", icon: "people", visible: "team", section: "admin" },
  { label: "Configuración", href: "/configuracion", icon: "settings", visible: "settings", section: "footer" },
] as const;
type Visible = { contacts: boolean; groups: boolean; campaigns: boolean; orders: boolean; tickets: boolean; incidents: boolean; inbox: boolean; team: boolean; activity: boolean; settings: boolean };
type IconName = typeof links[number]["icon"];

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-8h6v8" /></>,
    inbox: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 14h5l2 3h4l2-3h5" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    send: <><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 10-10" /></>,
    order: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    ticket: <><path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zM12 7v12" /></>,
    alert: <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  };
  return <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="17">{paths[name]}</svg>;
}

export function AuthNavigation({ accountName, visible }: { accountName?: string; visible?: Visible }) {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const content = document.querySelector<HTMLElement>(".app-content");
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (mobile) { content?.setAttribute("inert", ""); document.body.style.overflow = "hidden"; document.querySelector<HTMLElement>(".sidebar-nav .nav-link")?.focus(); }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpenedAt(null); menuButtonRef.current?.focus(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); if (mobile) { content?.removeAttribute("inert"); document.body.style.overflow = previousOverflow; } };
  }, [open]);
  if (!accountName || !/^\/$|^\/(?:clientes|grupos|bandeja|campanas|pedidos|tickets|incidencias|equipo|actividad|configuracion)(?:\/|$)/.test(pathname)) return null;
  const allowed = links.filter((link) => !("visible" in link) || Boolean(visible?.[link.visible as keyof Visible]));
  const renderLinks = (section: "work" | "admin" | "footer") => allowed.filter((link) => (("section" in link ? link.section : "work") === section)).map((link) => {
    const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`));
    return <Link aria-current={active ? "page" : undefined} className={`nav-link ${active ? "nav-link-active" : ""}`} href={link.href} key={link.href} onClick={() => setOpenedAt(null)}><NavIcon name={link.icon} /><span>{link.label}</span></Link>;
  });
  return <>
    <header className="mobile-app-bar"><Link className="brand-wordmark" href="/">BILLETERA</Link><span className="min-w-0 truncate text-xs text-muted">{accountName}</span><button aria-controls="app-sidebar-panel" aria-expanded={open} aria-label={open ? "Cerrar menú" : "Abrir menú"} className="icon-button" onClick={() => setOpenedAt(open ? null : pathname)} ref={menuButtonRef} type="button"><span aria-hidden="true">{open ? "×" : "☰"}</span></button></header>
    {open ? <button aria-label="Cerrar menú" className="sidebar-scrim" onClick={() => setOpenedAt(null)} type="button" /> : null}
    <aside aria-label="Menú de la aplicación" className={`app-sidebar ${open ? "app-sidebar-open" : ""}`} id="app-sidebar-panel">
      <div className="sidebar-brand"><Link className="brand-wordmark" href="/" onClick={() => setOpenedAt(null)}>BILLETERA<span aria-hidden="true" className="brand-mark">▪</span></Link><span className="sidebar-caption">ESPACIO DE TRABAJO</span></div>
      <nav aria-label="Navegación principal" className="sidebar-nav"><p className="sidebar-section-label">TRABAJO</p>{renderLinks("work")}{allowed.some((link) => "section" in link && link.section === "admin") ? <><p className="sidebar-section-label sidebar-section-divider">GESTIÓN</p>{renderLinks("admin")}</> : null}</nav>
      <div className="sidebar-footer">{renderLinks("footer")}<Link className="workspace-switch" href="/seleccionar-cartera" onClick={() => setOpenedAt(null)}><span className="workspace-monogram" aria-hidden="true">{accountName.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{accountName}</span><span className="block text-[11px] text-muted">Cartera actual</span></span><span aria-hidden="true" className="text-muted">↗</span></Link><SignOutButton /></div>
    </aside>
  </>;
}
