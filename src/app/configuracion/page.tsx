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
import { getEmailConnections } from "@/lib/email-connection-repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getAuthorizationContext();
  if (!hasPermission(context, WorkspacePermission.WORKSPACE_SETTINGS_VIEW)) notFound();
  const modules = await getWorkspaceModules(context);
  const emailConnections = await getEmailConnections(context);
  const emailConfigured = Boolean(process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() && process.env.RESEND_INBOUND_API_KEY?.trim());

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
        <SectionHeader title="Email" />
        {emailConnections.length ? <div className="mt-3 divide-y divide-border">{emailConnections.map((connection) => <div className="py-3 text-sm" key={connection.id}><p className="font-semibold">{connection.displayName || "Email"} · {connection.status === "ACTIVE" && emailConfigured ? "Conectado" : "Pendiente"}</p><p className="mt-1 break-all text-muted">{connection.address}</p><p className="mt-1 text-xs text-muted">Proveedor: {connection.provider === "RESEND" ? "Resend" : connection.provider}</p></div>)}</div> : <p className="mt-3 text-sm text-muted">Pendiente. Todavía no hay una dirección de email conectada a esta cartera.</p>}
        <p className="mt-2 text-xs text-muted">Los emails recibidos aparecen en Bandeja. Por ahora, solo lectura.</p>
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
