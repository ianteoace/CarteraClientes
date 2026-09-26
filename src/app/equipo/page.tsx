import { WorkspacePermission, WorkspaceRole } from "@prisma/client";
import Link from "next/link";
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

  return <main className="app-page max-w-6xl">
    <div className="mb-7"><p className="eyebrow">Mi cartera</p><h1 className="page-heading">Equipo</h1><p className="page-description">{members.length} {members.length === 1 ? "miembro" : "miembros"}{teamMetrics ? ` · ${teamMetrics.totals.openTickets} tickets abiertos${teamMetrics.incidentsAvailable ? ` · ${teamMetrics.totals.openIncidents} incidencias abiertas` : ""}` : ""}</p></div>
    {teamMetrics ? <nav className="mb-5 flex flex-wrap gap-2 border-y border-border py-3" aria-label="Período de métricas">{(Object.keys(METRICS_PERIOD) as Array<keyof typeof METRICS_PERIOD>).map((value) => <Link className={value === period ? "btn-primary" : "btn-secondary"} href={`/equipo?period=${value}`} key={value}>Últimos {METRICS_PERIOD[value]} días</Link>)}</nav> : null}
    <div className="border-t border-border">
      {teamMetrics ? <div className={`hidden gap-4 bg-surface px-3 py-2 text-xs font-semibold text-muted md:grid ${teamMetrics.incidentsAvailable ? "md:grid-cols-[minmax(12rem,1.4fr)_8rem_repeat(4,7rem)]" : "md:grid-cols-[minmax(12rem,1.4fr)_8rem_repeat(2,7rem)]"}`}><span>Miembro</span><span>Rol</span><span>Tickets abiertos</span><span>Resueltos</span>{teamMetrics.incidentsAvailable ? <><span>Incidencias abiertas</span><span>Resueltas</span></> : null}</div> : null}
      {visible.map((member) => {
        const metrics = metricsByMember.get(member.id);
        return <Link key={member.id} href={`/equipo/${member.id}?period=${period}`} className={teamMetrics ? `grid gap-2 border-b border-border px-1 py-4 transition-colors hover:bg-surface focus-visible:bg-surface sm:px-3 md:items-center md:gap-4 ${teamMetrics.incidentsAvailable ? "md:grid-cols-[minmax(12rem,1.4fr)_8rem_repeat(4,7rem)]" : "md:grid-cols-[minmax(12rem,1.4fr)_8rem_repeat(2,7rem)]"}` : "flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border px-1 py-4 transition-colors hover:bg-surface focus-visible:bg-surface sm:px-3"}>
          <div className="min-w-0"><div className="truncate text-base font-semibold">{member.label}{member.userId === user.id ? <span className="ml-2 text-xs font-normal text-muted">Vos</span> : null}</div>{member.email ? <div className="truncate text-xs text-muted">{member.email}</div> : null}{!teamMetrics ? <div className="mt-1 text-sm text-muted">{ROLE_LABELS[member.role]}{member.permissionOverrides.length ? " · Personalizado" : ""}</div> : null}</div>
          {teamMetrics && metrics ? <><div className="text-sm text-muted"><span className="md:hidden">{ROLE_LABELS[member.role]}{member.permissionOverrides.length ? " · Personalizado" : ""}</span><span className="hidden md:inline">{ROLE_LABELS[member.role]}</span></div><div className="text-sm"><strong>{metrics.current.openTickets}</strong><span className="ml-1 md:hidden">tickets abiertos</span></div><div className="text-sm"><strong>{metrics.period.resolvedTickets}</strong><span className="ml-1 md:hidden">resueltos · {teamMetrics.days} días</span></div>{teamMetrics.incidentsAvailable ? <><div className="text-sm"><strong>{metrics.current.openIncidents}</strong><span className="ml-1 md:hidden">incidencias abiertas</span></div><div className="text-sm"><strong>{metrics.period.resolvedIncidents}</strong><span className="ml-1 md:hidden">incidencias resueltas · {teamMetrics.days} días</span></div></> : null}</> : !teamMetrics ? <div className="text-right text-xs text-muted">{member.role === WorkspaceRole.OWNER || member.groupScopeMode === "ALL" ? "Todos los grupos" : `${member.groupAccess.length} ${member.groupAccess.length === 1 ? "grupo seleccionado" : "grupos seleccionados"}`}<span aria-hidden="true" className="ml-3 text-base text-foreground">→</span></div> : null}
        </Link>;
      })}
    </div>
    {canInvite ? <section className="mt-10"><h2 className="text-xl font-semibold tracking-tight">Invitar a Equipo</h2><p className="mb-4 mt-1 text-sm text-muted">El enlace vence en 7 días. Los permisos personalizados se ajustan después de aceptar.</p><InvitationForm groups={groups} canGrantAll={context.role === WorkspaceRole.OWNER || context.groupScopeMode === "ALL"} /></section> : null}
    <section className="mt-10"><h2 className="text-xl font-semibold tracking-tight">Invitaciones pendientes</h2>{invitations.length ? <div className="mt-4 border-t border-border">{invitations.map((invitation) => { const status = getInvitationStatus(invitation); return <div key={invitation.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-4"><div className="min-w-0"><p className="break-all font-medium">{invitation.email}</p><p className="mt-1 text-sm text-muted">{ROLE_LABELS[invitation.role]} · {invitation.groupScopeMode === "ALL" ? "Todos los grupos" : `${invitation._count.groupAccess} grupos seleccionados`} · {INVITATION_STATUS_LABELS[status]}</p><p className="mt-1 text-xs text-muted">Creada {invitation.createdAt.toLocaleDateString("es-AR")} · Vence {invitation.expiresAt.toLocaleDateString("es-AR")}{!invitation.emailSentAt ? " · Email no confirmado" : ""}</p></div>{canInvite && (status === "PENDING" || status === "EXPIRED") ? <InvitationActions invitationId={invitation.id} /> : null}</div>; })}</div> : <p className="mt-4 text-sm text-muted">No hay invitaciones pendientes.</p>}</section>
  </main>;
}
