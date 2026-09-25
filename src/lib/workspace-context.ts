import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthenticationRequiredError, getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultWorkspace, MultipleWorkspacesError } from "@/lib/workspace-repository";

const ACTIVE_WORKSPACE_COOKIE = "billetera_active_workspace";

export async function listUserWorkspaceMemberships(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
}

export function selectWorkspaceMembership<T extends { workspaceId: string }>(memberships: T[], activeWorkspaceId?: string) {
  const active = memberships.find((membership) => membership.workspaceId === activeWorkspaceId);
  if (active) return active;
  return memberships.length === 1 ? memberships[0] : null;
}

async function activeWorkspaceId() {
  return (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
}

function toContext(userId: string, membership: Awaited<ReturnType<typeof listUserWorkspaceMemberships>>[number]) {
  return {
    userId,
    workspaceId: membership.workspaceId,
    memberId: membership.id,
    role: membership.role,
    groupScopeMode: membership.groupScopeMode,
    workspace: membership.workspace,
  };
}

export async function getWorkspaceContextIfAvailable(userId: string) {
  const memberships = await listUserWorkspaceMemberships(userId);
  const selected = selectWorkspaceMembership(memberships, await activeWorkspaceId());
  return selected ? toContext(userId, selected) : null;
}

export async function requireWorkspaceContext() {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationRequiredError();

  const memberships = await listUserWorkspaceMemberships(user.id);
  const selected = selectWorkspaceMembership(memberships, await activeWorkspaceId());
  if (selected) return toContext(user.id, selected);
  if (memberships.length > 1) redirect("/seleccionar-cartera");

  try {
    return toContext(user.id, await getOrCreateDefaultWorkspace(user.id));
  } catch (error) {
    if (error instanceof MultipleWorkspacesError) redirect("/seleccionar-cartera");
    throw error;
  }
}

export async function setActiveWorkspaceCookie(workspaceId: string) {
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function requireWorkspaceId() {
  return (await requireWorkspaceContext()).workspaceId;
}
