"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./sign-out-button";

const links = [
  ["Mi cartera", "/"],
  ["Contactos", "/clientes"],
  ["Grupos", "/grupos"],
  ["Campañas", "/campanas"],
  ["Equipo", "/equipo"],
  ["Configuración", "/configuracion"],
] as const;

type Visible = { contacts: boolean; groups: boolean; campaigns: boolean; team: boolean; settings: boolean };

export function AuthNavigation({ accountName, visible }: { accountName?: string; visible?: Visible }) {
  const pathname = usePathname();
  if (!accountName || !/^\/$|^\/(?:clientes|grupos|campanas|equipo|configuracion)(?:\/|$)/.test(pathname)) return null;
  const visibleLinks = links.filter(([, href]) => href === "/"
    || (href === "/clientes" && visible?.contacts)
    || (href === "/grupos" && visible?.groups)
    || (href === "/campanas" && visible?.campaigns)
    || (href === "/equipo" && visible?.team)
    || (href === "/configuracion" && visible?.settings));

  return <header className="app-sidebar border-b border-border bg-[#111] text-white md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-56 md:border-b-0 md:border-r md:border-[#2a2a2a]">
    <nav className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-2 md:h-full md:flex-nowrap md:flex-col md:items-stretch md:px-3 md:py-5">
      <div className="flex w-full items-center justify-between md:block">
        <Link className="shrink-0 text-xs font-bold tracking-[.16em] text-white md:mb-8 md:ml-2 md:inline-block" href="/">BILLETERA</Link>
        <div className="md:hidden"><SignOutButton /></div>
      </div>
      <span className="hidden border-l border-[#333] pl-3 text-xs text-[#9a9a9a] md:order-none md:mb-5 md:block md:border-l-0 md:border-t md:border-[#2a2a2a] md:pl-2 md:pt-4">{accountName}</span>
      <div className="flex max-w-full gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {visibleLinks.map(([label, href]) => <Link
          className={`relative shrink-0 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "bg-white text-black" : "text-[#a8a8a8] hover:bg-[#1a1a1a] hover:text-white"}`}
          href={href} key={href}>{label}</Link>)}
      </div>
      <div className="ml-auto hidden shrink-0 md:mt-auto md:block md:border-t md:border-[#2a2a2a] md:pt-3"><SignOutButton /></div>
    </nav>
  </header>;
}
