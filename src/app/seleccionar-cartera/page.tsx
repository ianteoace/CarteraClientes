import { redirect } from "next/navigation";

import { chooseWorkspaceAction } from "./actions";
import { getCurrentUser } from "@/lib/auth/server";
import { ROLE_LABELS } from "@/lib/team-labels";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace-repository";
import { listUserWorkspaceMemberships } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function ChooseWorkspacePage({ searchParams }: PageProps<"/seleccionar-cartera">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await listUserWorkspaceMemberships(user.id);
  if (memberships.length === 0) {
    await getOrCreateDefaultWorkspace(user.id);
    redirect("/");
  }
  if (memberships.length === 1) redirect("/");
  const { error } = await searchParams;

  return <main className="app-page max-w-2xl py-12">
    <p className="eyebrow">Billetera</p>
    <h1 className="page-heading">Elegí una cartera</h1>
    <p className="page-description">Tenés acceso a más de una cartera. Seleccioná cuál querés abrir.</p>
    {error === "invalid" ? <p className="notice-error mt-6" role="alert">Ya no tenés acceso a esa cartera. Elegí otra.</p> : null}
    <div className="mt-8 border-t border-border">
      {memberships.map((member) => <form key={member.id} action={chooseWorkspaceAction} className="border-b border-border">
        <input type="hidden" name="workspaceId" value={member.workspaceId} />
        <button className="flex w-full items-center justify-between gap-4 px-2 py-5 text-left transition-colors hover:bg-surface focus-visible:bg-surface" type="submit">
          <span className="min-w-0"><span className="block truncate text-base font-semibold">{member.workspace.name}</span><span className="mt-1 block text-xs text-muted">{ROLE_LABELS[member.role]}</span></span>
          <span aria-hidden="true">→</span>
        </button>
      </form>)}
    </div>
  </main>;
}
