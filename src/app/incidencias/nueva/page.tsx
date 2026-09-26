import Link from "next/link";
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
  return <main className="app-page"><Link className="text-sm font-semibold text-muted hover:text-foreground" href="/incidencias">← Volver a Incidencias</Link><p className="eyebrow mt-7">Operación general</p><h1 className="page-heading">Nueva incidencia</h1><p className="page-description">Registrá un problema operativo que puede afectar a múltiples contactos y tickets.</p><IncidentForm members={options.members} /></main>;
}
