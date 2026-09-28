/** Shared, serializable campaign/template contracts. Never contains credentials. */
export const CAMPAIGN_DELIVERY_MODE = { MOCK: "MOCK", META_WHATSAPP: "META_WHATSAPP" } as const;
export type CampaignDeliveryMode = typeof CAMPAIGN_DELIVERY_MODE[keyof typeof CAMPAIGN_DELIVERY_MODE];
export class CampaignTemplateError extends Error {}
export function campaignDeliveryMode(value: unknown): CampaignDeliveryMode {
  if (value === undefined || value === null || value === "") return "MOCK";
  if (value === "MOCK" || value === "META_WHATSAPP") return value;
  throw new CampaignTemplateError("El tipo de envío no es válido.");
}

export type TemplateMapping = { source: "name" | "company" | "email" | "phone" | "static"; value?: string };
export type ParameterMapping = Record<string, TemplateMapping>;
export type MetaTemplate = {
  id?: string; name: string; language: string; category: string; status: string;
  parameter_format?: string; components: unknown[];
};
export type TemplateAnalysis = { compatible: boolean; reason?: string; body: string; header: string; footer: string; variables: number[]; buttons: Array<{ type: string; text: string; url?: string; phone_number?: string }> };
export type CampaignTemplateSelection = { connectionId: string; templateName: string; language: string; mapping: unknown };
export type CampaignTemplateSnapshot = {
  whatsappConnectionId: string | null; metaTemplateId: string | null; templateName: string;
  language: string; category: string; componentsSnapshot: unknown; parameterMapping: unknown;
};
export type CampaignMetaOptions = { deliveryMode?: string; template?: CampaignTemplateSelection };
export type TemplateContact = { name: string; company: string | null; email?: string | null; phone: string };
const INCOMPATIBLE = "Esta plantilla todavía no es compatible con Campañas de Billetera.";
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function analyzeTemplate(template: Pick<MetaTemplate, "category" | "components" | "parameter_format">): TemplateAnalysis {
  const invalid = (): TemplateAnalysis => ({ compatible: false, reason: INCOMPATIBLE, body: "", header: "", footer: "", variables: [], buttons: [] });
  if (!["MARKETING", "UTILITY"].includes(template.category) || (template.parameter_format && template.parameter_format !== "POSITIONAL")) return invalid();
  if (!Array.isArray(template.components) || !template.components.length || template.components.length > 4) return invalid();
  let body = "", header = "", footer = "";
  const buttons: TemplateAnalysis["buttons"] = [];
  const seen = new Set<string>();
  for (const item of template.components) {
    const component = record(item);
    if (!component || typeof component.type !== "string" || seen.has(component.type)) return invalid();
    seen.add(component.type);
    if (component.type === "BODY") {
      if (typeof component.text !== "string" || !component.text.trim() || component.text.length > 4096 || component.add_security_recommendation) return invalid();
      body = component.text;
    } else if (component.type === "HEADER" || component.type === "FOOTER") {
      if ((component.type === "HEADER" && component.format !== "TEXT") || typeof component.text !== "string" || /[{}]/.test(component.text)) return invalid();
      if (component.type === "HEADER") header = component.text; else footer = component.text;
    } else if (component.type === "BUTTONS") {
      if (!Array.isArray(component.buttons) || component.buttons.length > 10) return invalid();
      for (const value of component.buttons) {
        const button = record(value);
        if (!button || !["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(String(button.type)) || typeof button.text !== "string" || /\{\{|\}\}/.test(JSON.stringify(button))) return invalid();
        if (button.type === "URL" && (typeof button.url !== "string" || !/^https?:\/\//.test(button.url))) return invalid();
        if (button.type === "PHONE_NUMBER" && typeof button.phone_number !== "string") return invalid();
        buttons.push({ type: String(button.type), text: button.text, ...(button.type === "URL" ? { url: String(button.url) } : {}), ...(button.type === "PHONE_NUMBER" ? { phone_number: String(button.phone_number) } : {}) });
      }
    } else return invalid();
  }
  if (!body) return invalid();
  const matches = [...body.matchAll(/\{\{([1-9]\d*)\}\}/g)];
  if (/[{}]/.test(body.replace(/\{\{([1-9]\d*)\}\}/g, ""))) return invalid();
  const variables = [...new Set(matches.map((match) => Number(match[1])))].sort((a, b) => a - b);
  if (variables.length > 20 || variables.some((value, index) => value !== index + 1)) return invalid();
  return { compatible: true, body, header, footer, variables, buttons };
}

export function validateMapping(value: unknown, variables: number[]): ParameterMapping {
  const input = record(value);
  if (!input || Object.keys(input).length !== variables.length) throw new CampaignTemplateError("Completá el mapping de todas las variables de la plantilla.");
  const mapping: ParameterMapping = {};
  for (const variable of variables) {
    const entry = record(input[String(variable)]);
    if (!entry || !["name", "company", "email", "phone", "static"].includes(String(entry.source))) throw new CampaignTemplateError(`Elegí el valor de {{${variable}}}.`);
    const source = entry.source as TemplateMapping["source"];
    const text = typeof entry.value === "string" ? entry.value.trim() : "";
    if (source === "static" && (!text || text.length > 1024 || /[\r\n\t]/.test(text))) throw new CampaignTemplateError(`Ingresá un texto fijo válido para {{${variable}}}.`);
    mapping[String(variable)] = source === "static" ? { source, value: text } : { source };
  }
  return mapping;
}

export function resolveTemplateParameters(mapping: ParameterMapping, variables: number[], contact: TemplateContact): string[] {
  return variables.map((variable) => {
    const entry = mapping[String(variable)];
    const value = (entry?.source === "static" ? entry.value : entry ? contact[entry.source] : undefined)?.trim();
    if (!value || value.length > 1024 || /[\r\n\t]/.test(value)) throw new CampaignTemplateError(`Un destinatario no puede resolver {{${variable}}}. Revisá los datos o usá texto fijo.`);
    return value;
  });
}

export function readFrozenParameters(value: unknown, count: number): string[] {
  if (!Array.isArray(value) || value.length !== count || value.some((text) => typeof text !== "string" || !text.trim() || text.length > 1024 || /[\r\n\t]/.test(text))) throw new CampaignTemplateError("Los parámetros congelados de la campaña no son válidos.");
  return value as string[];
}
export function templatePreview(analysis: TemplateAnalysis, parameters: string[]) {
  const body = analysis.body.replace(/\{\{([1-9]\d*)\}\}/g, (token, index: string) => parameters[Number(index) - 1] ?? token);
  return [analysis.header, body, analysis.footer].filter(Boolean).join("\n\n");
}
