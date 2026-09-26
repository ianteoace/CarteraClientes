import "server-only";

import { Prisma } from "@prisma/client";

import { hasAllGroups, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type MetricsRow = {
  memberId: string;
  openTickets: number;
  openIncidents: number;
  resolvedTickets: number;
  resolvedIncidents: number;
  participatedTickets: number;
  participatedIncidents: number;
  internalNotes: number;
  ticketResolutionSeconds: number | null;
  incidentResolutionSeconds: number | null;
  workspaceOpenTickets: number;
  workspaceOpenIncidents: number;
  workspaceResolvedTickets: number;
  workspaceResolvedIncidents: number;
};

export type RecentWorkRow = {
  id: string;
  type: string;
  number: number;
  title: string;
  status: string;
  latestActivityAt: Date;
  role: "RESOLVER" | "ASSIGNEE" | "PARTICIPANT";
};

function ticketScope(context: AuthorizationContext) {
  return hasAllGroups(context) ? Prisma.empty : Prisma.sql`
    AND EXISTS (
      SELECT 1
      FROM "ClientGroup" cg
      INNER JOIN "MemberGroupAccess" mga ON mga."groupId" = cg."groupId"
      WHERE cg."clientId" = c."contactId" AND mga."memberId" = ${context.memberId}
    )
  `;
}

export function queryWorkspaceTeamMetrics(context: AuthorizationContext, since: Date) {
  const includeIncidents = hasAllGroups(context);
  return prisma.$queryRaw<MetricsRow[]>(Prisma.sql`
    WITH current_members AS (
      SELECT wm."id"
      FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = ${context.workspaceId}
    ),
    visible_tickets AS (
      SELECT c."id", c."status", c."createdAt"
      FROM "Case" c
      WHERE c."workspaceId" = ${context.workspaceId}
        AND c."type" = 'TICKET'
        ${ticketScope(context)}
    ),
    visible_incidents AS (
      SELECT c."id", c."status", c."createdAt"
      FROM "Case" c
      WHERE c."workspaceId" = ${context.workspaceId}
        AND c."type" = 'INCIDENT'
        AND ${includeIncidents}
    ),
    visible_cases AS (
      SELECT "id", 'TICKET'::text AS "type", "createdAt" FROM visible_tickets
      UNION ALL
      SELECT "id", 'INCIDENT'::text AS "type", "createdAt" FROM visible_incidents
    ),
    open_ticket_counts AS (
      SELECT td."assignedMemberId" AS "memberId", COUNT(DISTINCT vt."id")::int AS "count"
      FROM visible_tickets vt
      INNER JOIN "TicketDetails" td ON td."caseId" = vt."id"
      WHERE vt."status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER') AND td."assignedMemberId" IS NOT NULL
      GROUP BY td."assignedMemberId"
    ),
    open_incident_counts AS (
      SELECT idt."assignedMemberId" AS "memberId", COUNT(DISTINCT vi."id")::int AS "count"
      FROM visible_incidents vi
      INNER JOIN "IncidentDetails" idt ON idt."caseId" = vi."id"
      WHERE vi."status" IN ('OPEN', 'INVESTIGATING', 'MONITORING') AND idt."assignedMemberId" IS NOT NULL
      GROUP BY idt."assignedMemberId"
    ),
    ranked_resolutions AS (
      SELECT a."actorMemberId" AS "memberId", vc."id" AS "caseId", vc."type", vc."createdAt" AS "caseCreatedAt",
        a."createdAt" AS "resolvedAt",
        ROW_NUMBER() OVER (PARTITION BY a."actorMemberId", vc."id" ORDER BY a."createdAt" DESC, a."id" DESC) AS "rank"
      FROM "Activity" a
      INNER JOIN visible_cases vc ON vc."id" = a."entityId"
      INNER JOIN current_members cm ON cm."id" = a."actorMemberId"
      WHERE a."workspaceId" = ${context.workspaceId}
        AND a."entityType" = 'CASE'
        AND a."action" IN ('CASE_STATUS_CHANGED', 'CASE_CLOSED')
        AND a."metadata"->>'to' = 'RESOLVED'
        AND a."createdAt" >= ${since}
    ),
    latest_resolutions AS (
      SELECT * FROM ranked_resolutions WHERE "rank" = 1
    ),
    resolution_counts AS (
      SELECT "memberId",
        COUNT(*) FILTER (WHERE "type" = 'TICKET')::int AS "tickets",
        COUNT(*) FILTER (WHERE "type" = 'INCIDENT')::int AS "incidents",
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "caseCreatedAt"))) FILTER (WHERE "type" = 'TICKET')::double precision AS "ticketSeconds",
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "caseCreatedAt"))) FILTER (WHERE "type" = 'INCIDENT')::double precision AS "incidentSeconds"
      FROM latest_resolutions
      GROUP BY "memberId"
    ),
    note_counts AS (
      SELECT a."actorMemberId" AS "memberId", COUNT(*)::int AS "count"
      FROM "Activity" a
      INNER JOIN visible_cases vc ON vc."id" = a."entityId"
      INNER JOIN current_members cm ON cm."id" = a."actorMemberId"
      WHERE a."workspaceId" = ${context.workspaceId}
        AND a."action" IN ('TICKET_NOTE_ADDED', 'INCIDENT_NOTE_ADDED')
        AND a."createdAt" >= ${since}
      GROUP BY a."actorMemberId"
    ),
    ticket_participation AS (
      SELECT tp."memberId", COUNT(DISTINCT vt."id")::int AS "count"
      FROM "TicketParticipant" tp
      INNER JOIN visible_tickets vt ON vt."id" = tp."caseId"
      WHERE tp."memberId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Activity" a
        WHERE a."workspaceId" = ${context.workspaceId} AND a."entityType" = 'CASE'
          AND a."entityId" = vt."id" AND a."createdAt" >= ${since}
      )
      GROUP BY tp."memberId"
    ),
    incident_participation AS (
      SELECT ip."memberId", COUNT(DISTINCT vi."id")::int AS "count"
      FROM "IncidentParticipant" ip
      INNER JOIN visible_incidents vi ON vi."id" = ip."caseId"
      WHERE ip."memberId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Activity" a
        WHERE a."workspaceId" = ${context.workspaceId} AND a."entityType" = 'CASE'
          AND a."entityId" = vi."id" AND a."createdAt" >= ${since}
      )
      GROUP BY ip."memberId"
    )
    SELECT cm."id" AS "memberId",
      COALESCE(ot."count", 0)::int AS "openTickets",
      COALESCE(oi."count", 0)::int AS "openIncidents",
      COALESCE(rc."tickets", 0)::int AS "resolvedTickets",
      COALESCE(rc."incidents", 0)::int AS "resolvedIncidents",
      COALESCE(tp."count", 0)::int AS "participatedTickets",
      COALESCE(ip."count", 0)::int AS "participatedIncidents",
      COALESCE(nc."count", 0)::int AS "internalNotes",
      rc."ticketSeconds" AS "ticketResolutionSeconds",
      rc."incidentSeconds" AS "incidentResolutionSeconds",
      (SELECT COUNT(*)::int FROM visible_tickets WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER')) AS "workspaceOpenTickets",
      (SELECT COUNT(*)::int FROM visible_incidents WHERE "status" IN ('OPEN', 'INVESTIGATING', 'MONITORING')) AS "workspaceOpenIncidents",
      (SELECT COUNT(DISTINCT "caseId")::int FROM latest_resolutions WHERE "type" = 'TICKET') AS "workspaceResolvedTickets",
      (SELECT COUNT(DISTINCT "caseId")::int FROM latest_resolutions WHERE "type" = 'INCIDENT') AS "workspaceResolvedIncidents"
    FROM current_members cm
    LEFT JOIN open_ticket_counts ot ON ot."memberId" = cm."id"
    LEFT JOIN open_incident_counts oi ON oi."memberId" = cm."id"
    LEFT JOIN resolution_counts rc ON rc."memberId" = cm."id"
    LEFT JOIN note_counts nc ON nc."memberId" = cm."id"
    LEFT JOIN ticket_participation tp ON tp."memberId" = cm."id"
    LEFT JOIN incident_participation ip ON ip."memberId" = cm."id"
    ORDER BY cm."id"
  `);
}

export function queryMemberRecentWork(
  context: AuthorizationContext,
  memberId: string,
  since: Date,
  includeTickets: boolean,
  includeIncidents: boolean,
) {
  const incidentScope = hasAllGroups(context) && includeIncidents;
  return prisma.$queryRaw<RecentWorkRow[]>(Prisma.sql`
    WITH visible_tickets AS (
      SELECT c."id", c."number", c."title", c."status", c."type"
      FROM "Case" c
      WHERE c."workspaceId" = ${context.workspaceId} AND c."type" = 'TICKET' AND ${includeTickets}
        ${ticketScope(context)}
    ),
    visible_incidents AS (
      SELECT c."id", c."number", c."title", c."status", c."type"
      FROM "Case" c
      WHERE c."workspaceId" = ${context.workspaceId} AND c."type" = 'INCIDENT' AND ${incidentScope}
    ),
    visible_cases AS (
      SELECT * FROM visible_tickets
      UNION ALL
      SELECT * FROM visible_incidents
    ),
    recent AS (
      SELECT vc."id", vc."type", vc."number", vc."title", vc."status", MAX(a."createdAt") AS "latestActivityAt",
        BOOL_OR(a."actorMemberId" = ${memberId}
          AND a."action" IN ('CASE_STATUS_CHANGED', 'CASE_CLOSED')
          AND a."metadata"->>'to' = 'RESOLVED') AS "resolvedByMember",
        CASE WHEN vc."type" = 'TICKET'
          THEN EXISTS (SELECT 1 FROM "TicketDetails" td WHERE td."caseId" = vc."id" AND td."assignedMemberId" = ${memberId})
          ELSE EXISTS (SELECT 1 FROM "IncidentDetails" idt WHERE idt."caseId" = vc."id" AND idt."assignedMemberId" = ${memberId})
        END AS "isAssignee",
        CASE WHEN vc."type" = 'TICKET'
          THEN EXISTS (SELECT 1 FROM "TicketParticipant" tp WHERE tp."caseId" = vc."id" AND tp."memberId" = ${memberId})
          ELSE EXISTS (SELECT 1 FROM "IncidentParticipant" ip WHERE ip."caseId" = vc."id" AND ip."memberId" = ${memberId})
        END AS "isParticipant"
      FROM visible_cases vc
      INNER JOIN "Activity" a ON a."entityId" = vc."id" AND a."workspaceId" = ${context.workspaceId}
        AND a."entityType" = 'CASE' AND a."createdAt" >= ${since}
      GROUP BY vc."id", vc."type", vc."number", vc."title", vc."status"
    )
    SELECT "id", "type", "number", "title", "status", "latestActivityAt",
      CASE WHEN "resolvedByMember" THEN 'RESOLVER'
        WHEN "isAssignee" THEN 'ASSIGNEE'
        ELSE 'PARTICIPANT'
      END AS "role"
    FROM recent
    WHERE "resolvedByMember" OR "isAssignee" OR "isParticipant"
    ORDER BY "latestActivityAt" DESC, "id" DESC
    LIMIT 10
  `);
}
