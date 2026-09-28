import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
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
    <main className="app-page module-page settings-layout">
      <PageHeader eyebrow="Mi cartera" title="Configuración" description="Preferencias y seguridad de esta cartera." />
      <WorkspaceSettingsForm description={context.workspace.description} name={context.workspace.name} canEdit={hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_EDIT)} />
      <WorkspaceModulesSettings initialModules={modules} canEdit={hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_EDIT)} />
      <section className="settings-section">
        <SectionHeader title="Cuenta y seguridad" />
        <p className="mt-3 text-sm text-zinc-600">{user.email}</p>
        <EmailVerification email={user.email} initialEmailVerified={user.emailVerified} />
      </section>
      <section className="settings-section">
        <SectionHeader title="WhatsApp" />
        <p className="mt-2 text-sm text-zinc-600">
          Consultá las herramientas y el estado técnico de WhatsApp. Los datos de acceso no se muestran en esta página.
        </p>
        <Link className="btn-secondary mt-4" href="/configuracion/whatsapp">
          Configurar WhatsApp
        </Link>
      </section>
    </main>
  );
}
