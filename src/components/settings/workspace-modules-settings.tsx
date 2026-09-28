"use client";

import { useState, useTransition } from "react";
import { SectionHeader } from "@/components/ui/section-header";

import { updateWorkspaceModuleAction } from "@/app/configuracion/actions";
import {
  AVAILABLE_MODULES,
  KNOWN_MODULES,
  WORKSPACE_MODULE,
  WORKSPACE_MODULE_DETAILS,
  type WorkspaceModuleKey,
} from "@/lib/workspace-modules";

type Props = {
  initialModules: Readonly<Record<WorkspaceModuleKey, boolean>>;
  canEdit: boolean;
};

export function WorkspaceModulesSettings({ initialModules, canEdit }: Props) {
  const [modules, setModules] = useState(initialModules);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: WorkspaceModuleKey) {
    const next = !modules[key];
    if (!next && (key === WORKSPACE_MODULE.TICKETS || key === WORKSPACE_MODULE.INCIDENTS)) {
      const noun = key === WORKSPACE_MODULE.TICKETS ? "Los tickets" : "Las incidencias";
      if (!window.confirm(`${noun} existentes se ocultarán hasta que vuelvas a activar el módulo.`)) return;
    }
    setNotice(null);
    startTransition(async () => {
      const result = await updateWorkspaceModuleAction(key, next);
      if (result.success) {
        setModules((current) => ({ ...current, [key]: next }));
        setNotice({ success: true, message: `${WORKSPACE_MODULE_DETAILS[key].label}: ${next ? "activado" : "desactivado"}.` });
      } else {
        setNotice({ success: false, message: result.error });
      }
    });
  }

  return <section className="settings-section" aria-labelledby="workspace-modules-heading">
    <div>
      <div id="workspace-modules-heading"><SectionHeader title="Módulos" /></div>
      <p className="mt-1 text-xs leading-5 text-muted">Elegí qué áreas operativas están disponibles en esta cartera.</p>
    </div>
    {notice ? <p className={notice.success ? "notice-success mt-4" : "notice-error mt-4"} role="status">{notice.message}</p> : null}
    <div className="mt-5 divide-y divide-border border-y border-border">
      {KNOWN_MODULES.map((key) => {
        const available = (AVAILABLE_MODULES as readonly WorkspaceModuleKey[]).includes(key);
        const enabled = modules[key];
        return <div className={enabled ? "flex items-center justify-between gap-4 py-3" : "flex items-center justify-between gap-4 py-3 text-muted"} key={key}>
          <div>
            <h3 className="font-semibold">{WORKSPACE_MODULE_DETAILS[key].label}</h3>
            <p className="mt-1 text-sm text-muted">{WORKSPACE_MODULE_DETAILS[key].description}</p>
          </div>
          {available ? <button
            aria-pressed={enabled}
            className="module-switch"
            aria-label={WORKSPACE_MODULE_DETAILS[key].label}
            disabled={!canEdit || pending}
            onClick={() => toggle(key)}
            type="button"
          ><span className="module-switch-track" aria-hidden="true" /><span>{enabled ? "Activado" : "Desactivado"}</span></button> : <span className="badge-neutral shrink-0">Próximamente</span>}
        </div>;
      })}
    </div>
    {!canEdit ? <p className="mt-3 text-xs text-muted">Solo lectura: no tenés permiso para editar la configuración.</p> : null}
  </section>;
}
