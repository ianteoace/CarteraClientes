import "server-only";

import { WorkspacePermission } from "@prisma/client";

import { hasAllGroups, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { queryMemberRecentWork, queryWorkspaceTeamMetrics } from "@/lib/team-metrics-repository";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const METRICS_PERIOD = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

export type MetricsPeriod = keyof typeof METRICS_PERIOD;

export function normalizeMetricsPeriod(value?: string): MetricsPeriod {
  return value && value in METRICS_PERIOD ? value as MetricsPeriod : "30d";
}

function periodStart(period: MetricsPeriod, now = new Date()) {
  return new Date(now.getTime() - METRICS_PERIOD[period] * 24 * 60 * 60 * 1_000);
}

export type MemberMetrics = {
  memberId: string;
  current: { openTickets: number; openIncidents: number };
  period: {
    resolvedTickets: number;
    resolvedIncidents: number;
    participatedTickets: number;
    participatedIncidents: number;
    internalNotes: number;
    ticketResolutionSeconds: number | null;
    incidentResolutionSeconds: number | null;
  };
};

export async function getWorkspaceTeamMetrics(context: AuthorizationContext, requestedPeriod?: string, now = new Date()) {
  requirePermission(context, WorkspacePermission.TEAM_METRICS_VIEW);
  const period = normalizeMetricsPeriod(requestedPeriod);
  const modules = await getWorkspaceModules(context);
  const ticketsAvailable = isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS);
  const incidentsAvailable = isModuleEnabled(modules, WORKSPACE_MODULE.INCIDENTS) && hasAllGroups(context);
  const rows = await queryWorkspaceTeamMetrics(context, periodStart(period, now), ticketsAvailable, incidentsAvailable);
  const metrics = rows.map((row): MemberMetrics => ({
    memberId: row.memberId,
    current: { openTickets: row.openTickets, openIncidents: row.openIncidents },
    period: {
      resolvedTickets: row.resolvedTickets,
      resolvedIncidents: row.resolvedIncidents,
      participatedTickets: row.participatedTickets,
      participatedIncidents: row.participatedIncidents,
      internalNotes: row.internalNotes,
      ticketResolutionSeconds: row.ticketResolutionSeconds,
      incidentResolutionSeconds: row.incidentResolutionSeconds,
    },
  }));
  const first = rows[0];
  return {
    period,
    days: METRICS_PERIOD[period],
    since: periodStart(period, now),
    ticketsAvailable,
    incidentsAvailable,
    metrics,
    totals: {
      openTickets: first?.workspaceOpenTickets ?? 0,
      openIncidents: first?.workspaceOpenIncidents ?? 0,
      resolvedTickets: first?.workspaceResolvedTickets ?? 0,
      resolvedIncidents: first?.workspaceResolvedIncidents ?? 0,
    },
  };
}

export async function getMemberMetrics(context: AuthorizationContext, memberId: string, requestedPeriod?: string, now = new Date()) {
  const result = await getWorkspaceTeamMetrics(context, requestedPeriod, now);
  const member = result.metrics.find((item) => item.memberId === memberId);
  return member ? { ...result, member } : null;
}

export async function getMemberRecentWork(context: AuthorizationContext, memberId: string, requestedPeriod?: string, now = new Date()) {
  requirePermission(context, WorkspacePermission.TEAM_METRICS_VIEW);
  const exists = await prisma.workspaceMember.count({ where: { id: memberId, workspaceId: context.workspaceId } });
  if (!exists) return null;
  const period = normalizeMetricsPeriod(requestedPeriod);
  const modules = await getWorkspaceModules(context);
  const canViewTickets = isModuleEnabled(modules, WORKSPACE_MODULE.TICKETS) && hasPermission(context, WorkspacePermission.TICKET_VIEW);
  const canViewIncidents = isModuleEnabled(modules, WORKSPACE_MODULE.INCIDENTS) && hasAllGroups(context) && hasPermission(context, WorkspacePermission.INCIDENT_VIEW);
  const rows = canViewTickets || canViewIncidents
    ? await queryMemberRecentWork(context, memberId, periodStart(period, now), canViewTickets, canViewIncidents)
    : [];
  return rows.map((row) => ({
    ...row,
    href: row.type === "TICKET" ? `/tickets/${row.number}` : `/incidencias/${row.number}`,
  }));
}

export function formatMetricDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} d ${remainingHours} h` : `${days} d`;
}
