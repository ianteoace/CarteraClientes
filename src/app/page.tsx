import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, getClientScopeFilter, getGroupScopeFilter, hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getAuthorizationContext();
  const canSeeContacts = hasPermission(context, WorkspacePermission.CONTACT_VIEW);
  const canSeeGroups = hasPermission(context, WorkspacePermission.GROUP_VIEW);
  const canSeeCampaigns = hasPermission(context, WorkspacePermission.CAMPAIGN_VIEW);
  const [contacts, authorized, groups, campaigns, ready] = await Promise.all([
    canSeeContacts ? prisma.client.count({ where: getClientScopeFilter(context) }) : 0,
    canSeeContacts ? prisma.client.count({ where: { ...getClientScopeFilter(context), optIn: true } }) : 0,
    canSeeGroups ? prisma.group.count({ where: getGroupScopeFilter(context) }) : 0,
    canSeeCampaigns ? prisma.campaign.count({ where: { workspaceId: context.workspaceId } }) : 0,
    canSeeCampaigns ? prisma.campaign.count({ where: { workspaceId: context.workspaceId, status: "READY" } }) : 0,
  ]);

  const actions = [
    { label: "+ Agregar contacto", href: "/clientes", allowed: hasPermission(context, WorkspacePermission.CONTACT_CREATE) },
    { label: "Importar contactos", href: "/clientes", allowed: hasPermission(context, WorkspacePermission.CONTACT_CREATE) },
    { label: "Crear grupo", href: "/grupos", allowed: hasPermission(context, WorkspacePermission.GROUP_CREATE) },
    { label: "Preparar mensaje", href: "/campanas/nueva", allowed: hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE) },
  ].filter(({ allowed }) => allowed);

  return <main className="app-page space-y-7"><header className="border-b border-border pb-5"><p className="eyebrow">Tu espacio personal y profesional</p><h1 className="page-heading">Mi cartera</h1><p className="page-description">Las personas y grupos que elegiste mantener cerca.</p></header><section className="grid gap-4 border-b border-border pb-5 sm:grid-cols-[1.2fr_repeat(3,1fr)]"><div><p className="text-5xl font-bold tracking-[-.07em]">{canSeeContacts ? contacts : "—"}</p><p className="mt-1 text-sm font-medium text-muted">Contactos</p></div><div className="border-l border-border pl-4"><p className="text-2xl font-semibold tracking-[-.04em]">{canSeeContacts ? authorized : "—"}</p><p className="mt-1 text-sm text-muted">autorizados</p></div><div className="border-l border-border pl-4"><p className="text-2xl font-semibold tracking-[-.04em]">{canSeeGroups ? groups : "—"}</p><p className="mt-1 text-sm text-muted">grupos</p></div><div className="border-l border-border pl-4"><p className="text-2xl font-semibold tracking-[-.04em]">{canSeeCampaigns ? campaigns : "—"}</p><p className="mt-1 text-sm text-muted">campañas</p></div></section><section className="grid gap-7 lg:grid-cols-[1.2fr_.8fr]"><div className="space-y-3"><h2 className="text-sm font-bold uppercase tracking-[.12em]">Acciones rápidas</h2><div className="grid border-y border-border sm:grid-cols-2">{actions.map(({ label, href }, index) => <Link className={`group flex items-center justify-between border-border py-3 text-sm font-semibold transition-colors hover:text-[#6b6b6b] ${index % 2 ? "sm:border-l sm:pl-5" : "sm:pr-5"}`} href={href} key={label}><span>{label}</span><span className="transition-transform group-hover:translate-x-1">→</span></Link>)}</div></div>{canSeeCampaigns ? <aside className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"><p className="text-sm font-bold uppercase tracking-[.12em]">Estado</p><p className="mt-3 text-sm leading-6 text-muted">{ready ? `${ready} ${ready === 1 ? "campaña está lista" : "campañas están listas"} para simular.` : "No hay campañas listas para simular."}</p><Link className="mt-4 inline-block text-sm font-semibold underline underline-offset-4 hover:text-muted" href="/campanas">Ver campañas</Link></aside> : null}</section></main>;
}
