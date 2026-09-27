import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, getClientScopeFilter, getGroupScopeFilter, hasPermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  const canSeeContacts = hasPermission(context, WorkspacePermission.CONTACT_VIEW);
  const canSeeGroups = hasPermission(context, WorkspacePermission.GROUP_VIEW);
  const campaignsEnabled = isModuleEnabled(modules, WORKSPACE_MODULE.CAMPAIGNS);
  const canSeeCampaigns = campaignsEnabled && hasPermission(context, WorkspacePermission.CAMPAIGN_VIEW);
  const [contacts, authorized, groups, campaigns, ready] = await Promise.all([
    canSeeContacts ? prisma.client.count({ where: getClientScopeFilter(context) }) : 0,
    canSeeContacts ? prisma.client.count({ where: { ...getClientScopeFilter(context), optIn: true } }) : 0,
    canSeeGroups ? prisma.group.count({ where: getGroupScopeFilter(context) }) : 0,
    canSeeCampaigns ? prisma.campaign.count({ where: { workspaceId: context.workspaceId } }) : 0,
    canSeeCampaigns ? prisma.campaign.count({ where: { workspaceId: context.workspaceId, status: "READY" } }) : 0,
  ]);
  const metrics = [
    ...(canSeeContacts ? [{ label: "Contactos", value: contacts, href: "/clientes" }, { label: "Autorizados", value: authorized, href: "/clientes" }] : []),
    ...(canSeeGroups ? [{ label: "Grupos", value: groups, href: "/grupos" }] : []),
    ...(canSeeCampaigns ? [{ label: "Campañas", value: campaigns, href: "/campanas" }] : []),
  ];
  const actions = [
    { label: "Agregar contacto", href: "/clientes", allowed: hasPermission(context, WorkspacePermission.CONTACT_CREATE) },
    { label: "Importar contactos", href: "/clientes", allowed: hasPermission(context, WorkspacePermission.CONTACT_CREATE) },
    { label: "Crear grupo", href: "/grupos", allowed: hasPermission(context, WorkspacePermission.GROUP_CREATE) },
    { label: "Preparar mensaje", href: "/campanas/nueva", allowed: campaignsEnabled && hasPermission(context, WorkspacePermission.CAMPAIGN_CREATE) },
    { label: "Abrir Bandeja", href: "/bandeja", allowed: isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) && hasPermission(context, WorkspacePermission.INBOX_VIEW) },
  ].filter(({ allowed }) => allowed);

  return <main className="app-page app-page-wide space-y-8 lg:space-y-10">
    <PageHeader eyebrow="ESPACIO DE TRABAJO" title="Mi cartera" description="Una vista clara de lo que importa hoy." />
    {metrics.length ? <section aria-label="Resumen de la cartera" className="grid grid-cols-2 border-y border-border md:grid-cols-4">
      {metrics.map(({ label, value, href }, index) => <Link className={`group min-w-0 border-border py-5 transition-colors hover:bg-surface ${index > 0 ? "border-l pl-4 sm:pl-6" : "pr-4"} ${index === 2 ? "max-md:border-l-0 max-md:border-t max-md:pl-0" : ""} ${index === 3 ? "max-md:border-t" : ""}`} href={href} key={label}>
        <strong className="block text-[32px] font-semibold leading-none tracking-[-.055em] tabular-nums sm:text-[40px]">{value}</strong>
        <span className="mt-2 block text-xs font-medium text-muted group-hover:text-foreground">{label}</span>
      </Link>)}
    </section> : null}
    <div className="grid gap-9 xl:grid-cols-[minmax(0,1fr)_minmax(250px,.42fr)]">
      <section><SectionHeader title="Accesos rápidos" /><div className="mt-4 grid border-t border-border sm:grid-cols-2">{actions.map(({ label, href }, index) => <Link className={`group flex items-center justify-between gap-4 border-b border-border px-1 py-4 text-sm font-medium transition-colors hover:bg-surface ${index % 2 ? "sm:border-l sm:pl-5" : "sm:pr-5"}`} href={href} key={label}><span>{label}</span><span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-1">↗</span></Link>)}</div></section>
      {canSeeCampaigns ? <aside><SectionHeader title="En preparación" /><p className="mt-4 text-sm leading-6 text-muted">{ready ? `${ready} ${ready === 1 ? "campaña lista" : "campañas listas"} para simular.` : "No hay campañas listas para simular."}</p><Link className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4 hover:text-muted" href="/campanas">Ver campañas</Link></aside> : null}
    </div>
  </main>;
}
