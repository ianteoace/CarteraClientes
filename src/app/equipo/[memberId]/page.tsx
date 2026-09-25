import { WorkspacePermission, WorkspaceRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MemberEditor } from "@/components/team/member-editor";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/auth/server";
import { ALL_PERMISSIONS, getEffectivePermissions } from "@/lib/permission-presets";
import { getTeamMember, listManageableGroups, TeamMemberNotFoundError } from "@/lib/team-repository";

export const dynamic = "force-dynamic";

export default async function MemberPage({ params }: PageProps<"/equipo/[memberId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.TEAM_VIEW)) notFound();

  const { memberId } = await params;
  let member;
  try { member = await getTeamMember(context, memberId); }
  catch (error) { if (error instanceof TeamMemberNotFoundError) notFound(); throw error; }

  const ownOwner = member.id === context.memberId && member.role === WorkspaceRole.OWNER;
  const canManageRole = !ownOwner && hasPermission(context, WorkspacePermission.TEAM_MANAGE)
    && (context.role === WorkspaceRole.OWNER || member.role !== WorkspaceRole.OWNER);
  const canManagePermissions = !ownOwner && hasPermission(context, WorkspacePermission.PERMISSIONS_MANAGE)
    && member.role !== WorkspaceRole.OWNER;
  const groups = await listManageableGroups(context);
  const effective = getEffectivePermissions(member.role, member.permissionOverrides);
  const invitedEmail = member.acceptedInvitations[0]?.email;
  const identity = member.userId === user.id ? (user.name?.trim() || user.email) : (invitedEmail || `Usuario ${member.userId.slice(0, 8)}…`);

  return <main className="app-page max-w-4xl">
    <Link href="/equipo" className="mb-5 inline-block text-sm text-muted hover:text-foreground">← Volver a Equipo</Link>
    <div className="mb-8 border-b border-border pb-5">
      <p className="eyebrow">Miembro del equipo</p>
      <h1 className="page-heading break-words">{identity}</h1>
      {member.userId === user.id ? <p className="page-description">{user.email} · Vos</p> : invitedEmail ? <p className="page-description">{invitedEmail}</p> : null}
    </div>
    <MemberEditor
      memberId={member.id}
      role={member.role}
      actorRole={context.role}
      actorHasAllGroups={context.role === WorkspaceRole.OWNER || context.groupScopeMode === "ALL"}
      actorPermissions={ALL_PERMISSIONS.filter((permission) => context.permissions.has(permission))}
      canManageRole={canManageRole}
      canManagePermissions={canManagePermissions}
      effectivePermissions={ALL_PERMISSIONS.filter((permission) => effective.has(permission))}
      overridePermissions={member.permissionOverrides.map((item) => item.permission)}
      scopeMode={member.role === WorkspaceRole.OWNER ? "ALL" : member.groupScopeMode}
      selectedGroupIds={member.groupAccess.map((item) => item.groupId)}
      groups={groups}
    />
  </main>;
}
