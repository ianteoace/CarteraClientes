"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { setActiveWorkspaceCookie } from "@/lib/workspace-context";

export async function chooseWorkspaceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const workspaceId = formData.get("workspaceId");
  if (typeof workspaceId !== "string" || !workspaceId || workspaceId.length > 100) {
    redirect("/seleccionar-cartera?error=invalid");
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { id: true },
  });
  if (!membership) redirect("/seleccionar-cartera?error=invalid");
  await setActiveWorkspaceCookie(workspaceId);
  redirect("/");
}
