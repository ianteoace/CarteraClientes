import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { notFound } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { IncidentForm } from "@/components/incidents/incident-form";
import { getAuthorizationContext, hasAllGroups, hasPermission } from "@/lib/authorization";
import { getIncidentFormOptions } from "@/lib/incident-service";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function NewIncidentPage() {
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INCIDENTS) || !hasPermission(context, WorkspacePermission.INCIDENT_CREATE) || !hasAllGroups(context)) notFound();
  const options = await getIncidentFormOptions(context);
  return <main className="app-page module-page"><Link className="text-sm font-semibold text-muted hover:text-foreground" href="/incidencias">← Volver a Incidencias</Link><div className="mt-5"><PageHeader eyebrow="Operación general" title="Nueva incidencia" description="Registrá un problema operativo que puede afectar a múltiples contactos y tickets." /></div><IncidentForm members={options.members} /></main>;
}
