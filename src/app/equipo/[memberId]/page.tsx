import { WorkspacePermission, WorkspaceRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MemberEditor } from "@/components/team/member-editor";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/auth/server";
import { INCIDENT_STATUS_LABELS } from "@/lib/incident-labels";
import { ALL_PERMISSIONS, getEffectivePermissions } from "@/lib/permission-presets";
import { METRICS_PERIOD, formatMetricDuration, getMemberMetrics, getMemberRecentWork, normalizeMetricsPeriod } from "@/lib/team-metrics-service";
import { getTeamMember, listManageableGroups, TeamMemberNotFoundError } from "@/lib/team-repository";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

export const dynamic = "force-dynamic";

const WORK_ROLE_LABELS = { RESOLVER: "Resolutor", ASSIGNEE: "Responsable", PARTICIPANT: "Participante" } as const;

function relativeTime(date: Date, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Ayer" : `Hace ${days} días`;
}

export default async function MemberPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ period?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.TEAM_VIEW)) notFound();
  const { memberId } = await params;
  let member;
  try { member = await getTeamMember(context, memberId); }
  catch (error) { if (error instanceof TeamMemberNotFoundError) notFound(); throw error; }

  const query = await searchParams;
  const period = normalizeMetricsPeriod(typeof query.period === "string" ? query.period : undefined);
  const canViewMetrics = hasPermission(context, WorkspacePermission.TEAM_METRICS_VIEW);
  const now = new Date();
  const [groups, metricsResult, recentWork] = await Promise.all([
    listManageableGroups(context),
    canViewMetrics ? getMemberMetrics(context, member.id, period, now) : Promise.resolve(null),
    canViewMetrics ? getMemberRecentWork(context, member.id, period, now) : Promise.resolve(null),
  ]);
  if (canViewMetrics && !metricsResult) notFound();

  const ownOwner = member.id === context.memberId && member.role === WorkspaceRole.OWNER;
  const canManageRole = !ownOwner && hasPermission(context, WorkspacePermission.TEAM_MANAGE) && (context.role === WorkspaceRole.OWNER || member.role !== WorkspaceRole.OWNER);
  const canManagePermissions = !ownOwner && hasPermission(context, WorkspacePermission.PERMISSIONS_MANAGE) && member.role !== WorkspaceRole.OWNER;
  const effective = getEffectivePermissions(member.role, member.permissionOverrides);
  const invitedEmail = member.acceptedInvitations[0]?.email;
  const identity = member.userId === user.id ? (user.name?.trim() || user.email) : (invitedEmail || `Usuario ${member.userId.slice(0, 8)}…`);
  const metrics = metricsResult?.member;

  return <main className="app-page max-w-5xl">
    <Link href={`/equipo?period=${period}`} className="mb-5 inline-block text-sm text-muted hover:text-foreground">← Volver a Equipo</Link>
    <div className="mb-8 border-b border-border pb-5"><p className="eyebrow">Miembro del equipo</p><h1 className="page-heading break-words">{identity}</h1>{member.userId === user.id ? <p className="page-description">{user.email} · Vos</p> : invitedEmail ? <p className="page-description">{invitedEmail}</p> : null}</div>

    {metricsResult && metrics ? <section className="mb-10 border-b border-border pb-8" aria-labelledby="member-metrics-heading">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Actividad del equipo</p><h2 className="text-xl font-semibold tracking-tight" id="member-metrics-heading">Resumen operacional</h2></div><nav className="flex flex-wrap gap-2" aria-label="Período de métricas">{(Object.keys(METRICS_PERIOD) as Array<keyof typeof METRICS_PERIOD>).map((value) => <Link className={value === period ? "btn-primary" : "btn-secondary"} href={`/equipo/${member.id}?period=${value}`} key={value}>{METRICS_PERIOD[value]} días</Link>)}</nav></div>
      <h3 className="eyebrow mt-7">Carga actual</h3><dl className={`mt-3 grid border-y border-border ${metricsResult.incidentsAvailable ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}><div className="py-4 sm:pr-6"><dt className="text-sm text-muted">Tickets abiertos</dt><dd className="mt-1 text-2xl font-semibold">{metrics.current.openTickets}</dd></div>{metricsResult.incidentsAvailable ? <div className="border-t border-border py-4 sm:border-l sm:border-t-0 sm:pl-6"><dt className="text-sm text-muted">Incidencias abiertas</dt><dd className="mt-1 text-2xl font-semibold">{metrics.current.openIncidents}</dd></div> : null}</dl>
      <h3 className="eyebrow mt-7">Actividad · últimos {metricsResult.days} días</h3><dl className="mt-3 divide-y divide-border border-y border-border">{[
        ["Tickets resueltos", metrics.period.resolvedTickets],
        ...(metricsResult.incidentsAvailable ? [["Incidencias resueltas", metrics.period.resolvedIncidents]] : []),
        ["Tickets con participación", metrics.period.participatedTickets],
        ...(metricsResult.incidentsAvailable ? [["Incidencias con participación", metrics.period.participatedIncidents]] : []),
        ["Notas internas", metrics.period.internalNotes],
        ["Tiempo medio resolución Ticket", formatMetricDuration(metrics.period.ticketResolutionSeconds)],
        ...(metricsResult.incidentsAvailable ? [["Tiempo medio resolución Incidencia", formatMetricDuration(metrics.period.incidentResolutionSeconds)]] : []),
      ].map(([label, value]) => <div className="flex items-baseline justify-between gap-5 py-3 text-sm" key={String(label)}><dt className="text-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
      <h3 className="eyebrow mt-7">Trabajo reciente</h3><div className="mt-3 divide-y divide-border border-y border-border">{recentWork?.length ? recentWork.map((item) => { const status = item.type === "TICKET" ? TICKET_STATUS_LABELS[item.status as keyof typeof TICKET_STATUS_LABELS] ?? item.status : INCIDENT_STATUS_LABELS[item.status as keyof typeof INCIDENT_STATUS_LABELS] ?? item.status; return <Link className="grid gap-1 py-4 transition-colors hover:bg-surface sm:grid-cols-[7rem_minmax(0,1fr)_9rem_8rem] sm:items-center sm:gap-4" href={item.href} key={item.id}><span className="text-xs font-bold uppercase tracking-wide text-muted">{item.type === "TICKET" ? "Ticket" : "Incidencia"} #{item.number}</span><span className="truncate text-sm font-semibold">{item.title}</span><span className="text-sm text-muted">{status} · {WORK_ROLE_LABELS[item.role]}</span><time className="text-xs text-muted sm:text-right">{relativeTime(item.latestActivityAt, now)}</time></Link>; }) : <p className="py-4 text-sm text-muted">Sin trabajo reciente para este período.</p>}</div>
    </section> : null}

    <MemberEditor memberId={member.id} role={member.role} actorRole={context.role} actorHasAllGroups={context.role === WorkspaceRole.OWNER || context.groupScopeMode === "ALL"} actorPermissions={ALL_PERMISSIONS.filter((permission) => context.permissions.has(permission))} canManageRole={canManageRole} canManagePermissions={canManagePermissions} effectivePermissions={ALL_PERMISSIONS.filter((permission) => effective.has(permission))} overridePermissions={member.permissionOverrides.map((item) => item.permission)} scopeMode={member.role === WorkspaceRole.OWNER ? "ALL" : member.groupScopeMode} selectedGroupIds={member.groupAccess.map((item) => item.groupId)} groups={groups} />
  </main>;
}
