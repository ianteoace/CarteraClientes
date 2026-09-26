import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { WorkspaceSettingsForm } from "@/components/settings/workspace-settings-form";
import { EmailVerification } from "@/components/settings/email-verification";
import { WorkspaceModulesSettings } from "@/components/settings/workspace-modules-settings";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { getWorkspaceModules } from "@/lib/workspace-module-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_VIEW)) notFound();
  const modules = await getWorkspaceModules(context);

  return (
    <main className="app-page max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Configuración</h1>
        <p className="mt-1 text-zinc-600">Personalizá esta cartera.</p>
      </div>
      <WorkspaceSettingsForm description={context.workspace.description} name={context.workspace.name} canEdit={hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_EDIT)} />
      <WorkspaceModulesSettings initialModules={modules} canEdit={hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_EDIT)} />
      <section className="surface p-6">
        <h2 className="text-xl font-semibold">Cuenta</h2>
        <p className="mt-3 text-sm text-zinc-600">{user.email}</p>
        <EmailVerification email={user.email} initialEmailVerified={user.emailVerified} />
      </section>
      <section className="surface p-6">
        <h2 className="text-xl font-semibold">WhatsApp</h2>
        <p className="mt-2 text-sm text-zinc-600">
          No conectado. Más adelante vas a poder conectar el número de WhatsApp que quieras usar con esta cartera.
        </p>
        <Link className="mt-4 inline-block rounded-md border px-3 py-2 text-sm font-medium" href="/configuracion/whatsapp">
          Configurar WhatsApp
        </Link>
      </section>
    </main>
  );
}
