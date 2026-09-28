import { WorkspacePermission, WorkspaceRole } from "@prisma/client";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { DataList } from "@/components/ui/data-list";
import { notFound, redirect } from "next/navigation";

import { InvitationActions } from "@/components/team/invitation-actions";
import { InvitationForm } from "@/components/team/invitation-form";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/auth/server";
import { listWorkspaceInvitations } from "@/lib/invitation-repository";
import { getInvitationStatus, INVITATION_STATUS_LABELS } from "@/lib/invitation-status";
import { METRICS_PERIOD, getWorkspaceTeamMetrics, normalizeMetricsPeriod } from "@/lib/team-metrics-service";
import { ROLE_LABELS } from "@/lib/team-labels";
import { listManageableGroups, listTeamMembers } from "@/lib/team-repository";

export const dynamic = "force-dynamic";

const roleOrder: Record<WorkspaceRole, number> = { OWNER: 0, ADMIN: 1, AGENT: 2, VIEWER: 3 };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.TEAM_VIEW)) notFound();
  const canInvite = hasPermission(context, WorkspacePermission.TEAM_MANAGE) && hasPermission(context, WorkspacePermission.PERMISSIONS_MANAGE);
  const canViewMetrics = hasPermission(context, WorkspacePermission.TEAM_METRICS_VIEW);
  const query = await searchParams;
  const period = normalizeMetricsPeriod(typeof query.period === "string" ? query.period : undefined);
  const [members, invitations, groups, teamMetrics] = await Promise.all([
    listTeamMembers(context),
    listWorkspaceInvitations(context),
    canInvite ? listManageableGroups(context) : Promise.resolve([]),
    canViewMetrics ? getWorkspaceTeamMetrics(context, period) : Promise.resolve(null),
  ]);
  const metricsByMember = new Map(teamMetrics?.metrics.map((metrics) => [metrics.memberId, metrics]) ?? []);
  const visible = members.map((member) => ({
    ...member,
    label: member.userId === user.id ? (user.name?.trim() || user.email) : (member.acceptedInvitations[0]?.email || `Usuario ${member.userId.slice(0, 8)}…`),
    email: member.userId === user.id ? user.email : member.acceptedInvitations[0]?.email || null,
  })).sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.label.localeCompare(b.label, "es"));

  return <main className="app-page module-page">
    <PageHeader eyebrow="Mi cartera" title="Equipo" metadata={members.length + " miembros" + (teamMetrics?.ticketsAvailable ? " · " + teamMetrics.totals.openTickets + " tickets abiertos" : "") + (teamMetrics?.incidentsAvailable ? " · " + teamMetrics.totals.openIncidents + " incidencias abiertas" : "")} />
    {teamMetrics ? <nav className="module-tabs my-4" aria-label="Período de métricas">{(Object.keys(METRICS_PERIOD) as Array<keyof typeof METRICS_PERIOD>).map((value) => <Link className="module-tab" aria-current={value === period ? "page" : undefined} href={`/equipo?period=${value}`} key={value}>Últimos {METRICS_PERIOD[value]} días</Link>)}</nav> : null}
    <DataList columns="team" label="Equipo de la cartera" headers={["Miembro", "Rol", "Alcance", ...(teamMetrics?.ticketsAvailable ? ["Tickets abiertos", "Resueltos"] : []), ...(teamMetrics?.incidentsAvailable ? ["Incidencias", "Resueltas"] : [])]}>
      {visible.map((member) => {
        const metrics = metricsByMember.get(member.id);
        return <Link className="data-row" href={`/equipo/${member.id}?period=${period}`} key={member.id}>
          <div><strong className="block truncate">{member.label}{member.userId === user.id ? <span className="ml-2 text-xs font-normal text-muted">Vos</span> : null}</strong>{member.email ? <p className="mt-1 truncate text-xs text-muted">{member.email}</p> : null}</div>
          <span className="text-muted">{ROLE_LABELS[member.role]}{member.permissionOverrides.length ? <span className="block text-[10px]">Personalizado</span> : null}</span>
          <span className="text-muted">{member.role === WorkspaceRole.OWNER || member.groupScopeMode === "ALL" ? "Todos los grupos" : member.groupAccess.length + " grupos seleccionados"}</span>
          {teamMetrics?.ticketsAvailable ? <><span className="tabular-nums"><strong>{metrics?.current.openTickets ?? "—"}</strong><span className="ml-1 xl:hidden">tickets abiertos</span></span><span className="tabular-nums"><strong>{metrics?.period.resolvedTickets ?? "—"}</strong><span className="ml-1 xl:hidden">resueltos</span></span></> : null}
          {teamMetrics?.incidentsAvailable ? <><span className="tabular-nums"><strong>{metrics?.current.openIncidents ?? "—"}</strong><span className="ml-1 xl:hidden">incidencias</span></span><span className="tabular-nums"><strong>{metrics?.period.resolvedIncidents ?? "—"}</strong><span className="ml-1 xl:hidden">resueltas</span></span></> : null}
        </Link>;
      })}
    </DataList>
    {canInvite ? <section className="mt-7"><SectionHeader title="Invitar a Equipo" /><p className="mb-4 mt-1 text-sm text-muted">El enlace vence en 7 días. Los permisos personalizados se ajustan después de aceptar.</p><InvitationForm groups={groups} canGrantAll={context.role === WorkspaceRole.OWNER || context.groupScopeMode === "ALL"} /></section> : null}
    <section className="mt-7"><SectionHeader title="Invitaciones pendientes" />{invitations.length ? <div className="mt-4 border-t border-border">{invitations.map((invitation) => { const status = getInvitationStatus(invitation); return <div key={invitation.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-4"><div className="min-w-0"><p className="break-all font-medium">{invitation.email}</p><p className="mt-1 text-sm text-muted">{ROLE_LABELS[invitation.role]} · {invitation.groupScopeMode === "ALL" ? "Todos los grupos" : `${invitation._count.groupAccess} grupos seleccionados`} · {INVITATION_STATUS_LABELS[status]}</p><p className="mt-1 text-xs text-muted">Creada {invitation.createdAt.toLocaleDateString("es-AR")} · Vence {invitation.expiresAt.toLocaleDateString("es-AR")}{!invitation.emailSentAt ? " · Email no confirmado" : ""}</p></div>{canInvite && (status === "PENDING" || status === "EXPIRED") ? <InvitationActions invitationId={invitation.id} /> : null}</div>; })}</div> : <p className="mt-4 text-sm text-muted">No hay invitaciones pendientes.</p>}</section>
  </main>;
}
