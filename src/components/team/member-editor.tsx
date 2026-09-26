"use client";

import { GroupScopeMode, WorkspacePermission, WorkspaceRole } from "@prisma/client";
import { useState, useTransition } from "react";

import {
  changeMemberRoleAction, resetMemberPermissionsAction,
  setMemberPermissionAction, TeamActionResult, updateMemberGroupScopeAction,
} from "@/app/equipo/actions";
import { ROLE_PERMISSION_PRESETS } from "@/lib/permission-presets";
import { PERMISSION_GROUPS, ROLE_LABELS } from "@/lib/team-labels";
import { getPermissionModule, WORKSPACE_MODULE_DETAILS, type WorkspaceModuleKey } from "@/lib/workspace-modules";

type Props = {
  memberId: string;
  role: WorkspaceRole;
  actorRole: WorkspaceRole;
  actorHasAllGroups: boolean;
  actorPermissions: WorkspacePermission[];
  canManageRole: boolean;
  canManagePermissions: boolean;
  effectivePermissions: WorkspacePermission[];
  overridePermissions: WorkspacePermission[];
  scopeMode: GroupScopeMode;
  selectedGroupIds: string[];
  groups: { id: string; name: string }[];
  disabledModules: WorkspaceModuleKey[];
};

export function MemberEditor({
  memberId, role, actorRole, actorHasAllGroups, actorPermissions, canManageRole, canManagePermissions,
  effectivePermissions, overridePermissions, scopeMode, selectedGroupIds, groups, disabledModules,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<TeamActionResult | null>(null);
  const [mode, setMode] = useState<GroupScopeMode>(scopeMode);
  const [selection, setSelection] = useState<string[]>(() => selectedGroupIds.filter((id) => groups.some((group) => group.id === id)));
  const [query, setQuery] = useState("");
  const actorSet = new Set(actorPermissions);
  const effectiveSet = new Set(effectivePermissions);
  const overrideSet = new Set(overridePermissions);
  const owner = role === WorkspaceRole.OWNER;
  const roleOptions = Object.values(WorkspaceRole).filter((option) => option === role || actorRole === WorkspaceRole.OWNER
    || (option !== WorkspaceRole.OWNER && ROLE_PERMISSION_PRESETS[option].every((permission) => actorSet.has(permission))));
  const visibleGroups = groups.filter((group) => group.name.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  const outsideScopeCount = selectedGroupIds.filter((id) => !groups.some((group) => group.id === id)).length;

  function run(operation: () => Promise<TeamActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      setNotice(result.success ? { success: true } : result);
    });
  }

  return <div className="space-y-9">
    {notice ? <p role="status" className={notice.success ? "notice-success" : "notice-error"}>
      {notice.success ? "Cambios guardados." : notice.error}
    </p> : null}

    <section className="border-b border-border pb-8" aria-labelledby="team-role-heading">
      <h2 id="team-role-heading" className="text-lg font-semibold">Rol</h2>
      <p className="mt-1 text-sm text-muted">El rol define los permisos predeterminados del miembro.</p>
      {canManageRole ? <div className="mt-4 max-w-sm">
        <label className="field-label" htmlFor="team-role">Rol del miembro</label>
        <select
          id="team-role" className="field mt-1" value={role} disabled={pending}
          onChange={(event) => {
            const nextRole = event.target.value as WorkspaceRole;
            if (nextRole === role) return;
            if (!window.confirm("Al cambiar el rol se restablecerán sus permisos personalizados. ¿Querés continuar?")) return;
            run(() => changeMemberRoleAction(memberId, nextRole));
          }}>
          {roleOptions.map((option) => <option value={option} key={option}>{ROLE_LABELS[option]}</option>)}
        </select>
      </div> : <p className="mt-4 text-sm font-medium">{ROLE_LABELS[role]}</p>}
      {overrideSet.size > 0 ? <p className="mt-2 text-xs text-muted">{overrideSet.size} {overrideSet.size === 1 ? "permiso personalizado" : "permisos personalizados"}</p> : null}
    </section>

    <section className="border-b border-border pb-8" aria-labelledby="team-permissions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="team-permissions-heading" className="text-lg font-semibold">Permisos</h2>
          <p className="mt-1 text-sm text-muted">Permisos efectivos de este miembro.</p>
        </div>
        {canManagePermissions && overrideSet.size > 0 ? <button
          type="button" className="btn-secondary" disabled={pending}
          onClick={() => {
            if (window.confirm("¿Restaurar todos los permisos predeterminados de este rol? El alcance de grupos no cambiará.")) {
              run(() => resetMemberPermissionsAction(memberId));
            }
          }}>Restaurar permisos del rol</button> : null}
      </div>
      {owner ? <p className="mt-3 text-sm text-muted">El Owner siempre tiene acceso total.</p> : null}
      <div className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => <div key={group.title}>
          <h3 className="border-b border-border pb-2 text-xs font-bold uppercase tracking-[.12em] text-muted">{group.title}</h3>
          <div className="divide-y divide-border">
            {group.permissions.map(([permission, label]) => {
              const checked = effectiveSet.has(permission);
              const customized = overrideSet.has(permission);
              const cannotGrant = !checked && actorRole !== WorkspaceRole.OWNER && !actorSet.has(permission);
              const permissionModule = getPermissionModule(permission);
              const moduleDisabled = permissionModule ? disabledModules.includes(permissionModule) : false;
              return <label key={permission} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                <span>{label}<span className="ml-2 text-xs text-muted">{moduleDisabled && permissionModule ? `${WORKSPACE_MODULE_DETAILS[permissionModule].label} — módulo desactivado` : customized ? "Personalizado" : "Predeterminado"}</span></span>
                <input
                  type="checkbox" className="h-5 w-5 shrink-0 accent-black"
                  checked={checked} disabled={!canManagePermissions || pending || cannotGrant || moduleDisabled}
                  aria-label={`${group.title}: ${label}`}
                  onChange={() => run(() => setMemberPermissionAction(memberId, permission, !checked))}
                />
              </label>;
            })}
          </div>
        </div>)}
      </div>
      {!canManagePermissions && !owner ? <p className="mt-4 text-xs text-muted">Solo lectura: no tenés permiso para gestionar permisos.</p> : null}
    </section>

    <section aria-labelledby="team-scope-heading">
      <h2 id="team-scope-heading" className="text-lg font-semibold">Acceso a contactos y grupos</h2>
      <p className="mt-1 text-sm text-muted">{owner ? "El Owner accede a todos los grupos." : "Definí qué grupos puede consultar este miembro."}</p>
      {canManagePermissions ? <div className="mt-4 space-y-3">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="radio" name="team-scope" className="h-5 w-5 accent-black" checked={mode === "ALL"} disabled={pending || !actorHasAllGroups} onChange={() => setMode(GroupScopeMode.ALL)} />
          Todos los grupos
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="radio" name="team-scope" className="h-5 w-5 accent-black" checked={mode === "SELECTED"} disabled={pending} onChange={() => { setMode(GroupScopeMode.SELECTED); if (scopeMode === GroupScopeMode.ALL) setSelection([]); }} />
          Solo grupos seleccionados
        </label>
        {mode === "SELECTED" ? <div className="border-l-2 border-border pl-4">
          <p className="mb-3 text-xs leading-5 text-muted">Con acceso seleccionado solo verá contactos pertenecientes a los grupos elegidos. Ningún grupo se agrega automáticamente.</p>
          {outsideScopeCount ? <p className="mb-3 text-xs text-muted">{outsideScopeCount} grupo(s) asignado(s) fuera de tu alcance no se muestran aquí.</p> : null}
          <input className="field mb-2 max-w-sm" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar grupo" aria-label="Buscar grupo" />
          <div className="max-h-60 overflow-y-auto border-y border-border">
            {visibleGroups.length ? visibleGroups.map((group) => <label key={group.id} className="flex min-h-11 items-center gap-3 border-b border-border px-1 text-sm last:border-b-0">
              <input type="checkbox" className="h-5 w-5 accent-black" checked={selection.includes(group.id)} disabled={pending}
                onChange={(event) => setSelection((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} />
              <span className="truncate">{group.name}</span>
            </label>) : <p className="py-3 text-sm text-muted">No hay grupos para mostrar.</p>}
          </div>
          <p className="mt-2 text-xs text-muted">{selection.length} {selection.length === 1 ? "grupo seleccionado" : "grupos seleccionados"}</p>
        </div> : null}
        <button type="button" className="btn-primary" disabled={pending}
          onClick={() => run(() => updateMemberGroupScopeAction(memberId, mode, mode === "SELECTED" ? selection : []))}>Guardar acceso</button>
      </div> : <div className="mt-4 text-sm">
        <p className="font-medium">{owner || scopeMode === "ALL" ? "Todos los grupos" : `${selectedGroupIds.length} grupos seleccionados`}</p>
        {!owner && scopeMode === "SELECTED" && selectedGroupIds.length ? <ul className="mt-2 list-inside list-disc text-muted">
          {groups.filter((group) => selectedGroupIds.includes(group.id)).map((group) => <li key={group.id}>{group.name}</li>)}
          {outsideScopeCount ? <li>{outsideScopeCount} fuera de tu alcance</li> : null}
        </ul> : null}
      </div>}
    </section>
  </div>;
}
