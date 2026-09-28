"use client";

import { useEffect, useState } from "react";
import { getCampaignTemplateCatalogAction } from "@/app/campanas/actions";
import { resolveTemplateParameters, templatePreview, type CampaignTemplateSelection, type MetaTemplate, type ParameterMapping, type TemplateAnalysis, type TemplateContact, type TemplateMapping } from "@/lib/campaign-delivery";
import { SectionHeader } from "@/components/ui/section-header";

type CatalogTemplate = MetaTemplate & { analysis: TemplateAnalysis };
const SOURCES: Array<[TemplateMapping["source"], string]> = [["name", "Nombre del contacto"], ["company", "Empresa"], ["email", "Email"], ["phone", "Teléfono"], ["static", "Texto fijo"]];

export function CampaignTemplatePicker({ connectionId, value, onChange, contacts = [] }: {
  connectionId: string; value?: CampaignTemplateSelection; onChange: (value: CampaignTemplateSelection) => void;
  contacts?: TemplateContact[];
}) {
  const [templates, setTemplates] = useState<CatalogTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    getCampaignTemplateCatalogAction(connectionId).then((result) => {
      if (!active) return;
      if (result.success) { setTemplates(result.templates); setError(undefined); }
      else setError(result.error);
    }).catch(() => { if (active) setError("No se pudieron consultar las plantillas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [connectionId, revision]);
  const eligible = templates.filter((template) => template.status === "APPROVED" && template.analysis.compatible);
  const selected = eligible.find((template) => template.name === value?.templateName && template.language === value.language);
  const mapping = (value?.mapping ?? {}) as ParameterMapping;

  function choose(key: string) {
    const template = eligible.find((item) => `${item.name}:${item.language}` === key);
    if (!template) return;
    onChange({ connectionId, templateName: template.name, language: template.language, mapping: Object.fromEntries(template.analysis.variables.map((variable) => [String(variable), { source: "name" }])) });
  }
  function update(variable: number, entry: TemplateMapping) { onChange({ connectionId, templateName: value!.templateName, language: value!.language, mapping: { ...mapping, [variable]: entry } }); }
  return <section className="space-y-4 border-y border-border py-5">
    <SectionHeader title="Plantilla de WhatsApp" />
    <p className="text-xs text-muted">Solo plantillas aprobadas de texto. Guardar o preparar no envía ningún mensaje.</p>
    <input type="hidden" name="connectionId" value={connectionId} />
    <input type="hidden" name="templateName" value={selected?.name ?? ""} />
    <input type="hidden" name="templateLanguage" value={selected?.language ?? ""} />
    <input type="hidden" name="parameterMapping" value={JSON.stringify(mapping)} />
    <label className="field-label">Plantilla / idioma<select className="field" required disabled={loading} value={selected ? `${selected.name}:${selected.language}` : ""} onChange={(event) => choose(event.target.value)}>
      <option value="">{loading ? "Consultando Meta…" : "Seleccioná una plantilla"}</option>
      {eligible.map((template) => <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>{template.name} · {template.language}</option>)}
    </select></label>
    <button className="btn-quiet" type="button" disabled={loading} onClick={() => { setLoading(true); setRevision((current) => current + 1); }}>Actualizar plantillas</button>
    {error ? <p className="notice-error" role="alert">{error}</p> : null}
    {!loading && !error && !eligible.length ? <p className="text-sm text-muted">No hay plantillas aprobadas compatibles en esta conexión.</p> : null}
    {templates.filter((template) => !template.analysis.compatible).length ? <details className="text-xs text-muted"><summary>Plantillas todavía no compatibles</summary><ul className="mt-2 space-y-2">{templates.filter((template) => !template.analysis.compatible).map((template) => <li key={`${template.name}:${template.language}`}>{template.name} · {template.language}: Esta plantilla todavía no es compatible con Campañas de Billetera.</li>)}</ul></details> : null}
    {selected ? <>
      <p className="text-xs text-muted">{selected.category === "MARKETING" ? "Marketing" : "Utilidad"} · {selected.language}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{templatePreview(selected.analysis, [])}</p>
      {selected.analysis.variables.map((variable) => <div className="grid gap-2 sm:grid-cols-2" key={variable}>
        <label className="field-label">{`Variable {{${variable}}}`}<select className="field" value={mapping[variable]?.source ?? ""} onChange={(event) => update(variable, { source: event.target.value as TemplateMapping["source"], ...(event.target.value === "static" ? { value: "" } : {}) })}>{SOURCES.map(([source, label]) => <option value={source} key={source}>{label}</option>)}</select></label>
        {mapping[variable]?.source === "static" ? <label className="field-label">Texto fijo<input className="field" required maxLength={1024} value={mapping[variable].value ?? ""} onChange={(event) => update(variable, { source: "static", value: event.target.value })} /></label> : null}
      </div>)}
      {contacts.slice(0, 3).map((contact, index) => {
        let preview: string;
        try { preview = templatePreview(selected.analysis, resolveTemplateParameters(mapping, selected.analysis.variables, contact)); }
        catch { preview = "Este contacto no puede resolver todas las variables. Revisá el mapping antes de preparar."; }
        return <div className="border-t border-border pt-3 text-sm" key={index}><strong>{contact.name}</strong><p className="mt-2 whitespace-pre-wrap break-words text-muted">{preview}</p></div>;
      })}
    </> : null}
  </section>;
}
