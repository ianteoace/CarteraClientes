import { WorkspacePermission, WorkspaceRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvitationActions } from "@/components/team/invitation-actions";
import { InvitationForm } from "@/components/team/invitation-form";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/auth/server";
import { listWorkspaceInvitations } from "@/lib/invitation-repository";
import { getInvitationStatus, INVITATION_STATUS_LABELS } from "@/lib/invitation-status";
import { ROLE_LABELS } from "@/lib/team-labels";
import { listManageableGroups, listTeamMembers } from "@/lib/team-repository";

export const dynamic = "force-dynamic";

const roleOrder: Record<WorkspaceRole, number> = { OWNER: 0, ADMIN: 1, AGENT: 2, VIEWER: 3 };

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.TEAM_VIEW)) notFound();
  const canInvite = hasPermission(context, WorkspacePermission.TEAM_MANAGE) && hasPermission(context, WorkspacePermission.PERMISSIONS_MANAGE);
  const [members, invitations, groups] = await Promise.all([
    listTeamMembers(context), listWorkspaceInvitations(context), canInvite ? listManageableGroups(context) : Promise.resolve([]),
  ]);
  const visible = members.map((member) => ({
    ...member,
    label: member.userId === user.id ? (user.name?.trim() || user.email) : (member.acceptedInvitations[0]?.email || `Usuario ${member.userId.slice(0, 8)}…`),
    email: member.userId === user.id ? user.email : member.acceptedInvitations[0]?.email || null,
  })).sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.label.localeCompare(b.label, "es"));

  return <main className="app-page max-w-4xl">
    <div className="mb-7">
      <p className="eyebrow">Mi cartera</p>
      <h1 className="page-heading">Equipo</h1>
      <p className="page-description">{members.length} {members.length === 1 ? "miembro" : "miembros"} en esta cartera.</p>
    </div>
    <div className="border-t border-border">
      {visible.map((member) => <Link key={member.id} href={`/equipo/${member.id}`} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border px-1 py-4 transition-colors hover:bg-surface focus-visible:bg-surface sm:px-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{member.label}{member.userId === user.id ? <span className="ml-2 text-xs font-normal text-muted">Vos</span> : null}</div>
          {member.email ? <div className="truncate text-xs text-muted">{member.email}</div> : null}
          <div className="mt-1 text-sm text-muted">{ROLE_LABELS[member.role]}{member.permissionOverrides.length ? " · Personalizado" : ""}</div>
        </div>
        <div className="text-right text-xs text-muted">
          {member.role === WorkspaceRole.OWNER || member.groupScopeMode === "ALL"
            ? "Todos los grupos"
            : `${member.groupAccess.length} ${member.groupAccess.length === 1 ? "grupo seleccionado" : "grupos seleccionados"}`}
          <span aria-hidden="true" className="ml-3 text-base text-foreground">→</span>
        </div>
      </Link>)}
    </div>
    {canInvite ? <section className="mt-10"><h2 className="text-xl font-semibold tracking-tight">Invitar a Equipo</h2><p className="mb-4 mt-1 text-sm text-muted">El enlace vence en 7 días. Los permisos personalizados se ajustan después de aceptar.</p><InvitationForm groups={groups} canGrantAll={context.role === WorkspaceRole.OWNER || context.groupScopeMode === "ALL"} /></section> : null}
    <section className="mt-10"><h2 className="text-xl font-semibold tracking-tight">Invitaciones pendientes</h2>
      {invitations.length ? <div className="mt-4 border-t border-border">{invitations.map((invitation) => {
        const status = getInvitationStatus(invitation);
        return <div key={invitation.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-4">
          <div className="min-w-0"><p className="break-all font-medium">{invitation.email}</p><p className="mt-1 text-sm text-muted">{ROLE_LABELS[invitation.role]} · {invitation.groupScopeMode === "ALL" ? "Todos los grupos" : `${invitation._count.groupAccess} grupos seleccionados`} · {INVITATION_STATUS_LABELS[status]}</p><p className="mt-1 text-xs text-muted">Creada {invitation.createdAt.toLocaleDateString("es-AR")} · Vence {invitation.expiresAt.toLocaleDateString("es-AR")}{!invitation.emailSentAt ? " · Email no confirmado" : ""}</p></div>
          {canInvite && (status === "PENDING" || status === "EXPIRED") ? <InvitationActions invitationId={invitation.id} /> : null}
        </div>;
      })}</div> : <p className="mt-4 text-sm text-muted">No hay invitaciones pendientes.</p>}
    </section>
  </main>;
}
