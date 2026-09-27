import { normalizePhone, PhoneNormalizationError } from "@/lib/phone";

export type WhatsAppRecipientFormat = "internal" | "meta-explicit" | "conversation";

const ARGENTINE_MOBILE_WITH_NINE = /^549(\d{10})$/;

function metaExplicitPhone(phone: string) {
  const trimmedPhone = phone.trim();
  if (!trimmedPhone || !/^\d+$/.test(trimmedPhone)) {
    throw new PhoneNormalizationError();
  }
  return trimmedPhone;
}

/** Conserva el wa_id como identidad y adapta solo el destinatario outbound. */
export function formatWhatsAppRecipientForSend(externalParticipantId: string) {
  const waId = metaExplicitPhone(externalParticipantId);
  const argentineMobile = waId.match(ARGENTINE_MOBILE_WITH_NINE);
  return argentineMobile ? `54${argentineMobile[1]}` : waId;
}

/**
 * Adapta un teléfono interno al formato esperado por Meta.
 *
 * `internal` adapta el teléfono normalizado de Billetera.
 * `conversation` adapta el wa_id inbound solo al construir el destinatario de envío.
 * `meta-explicit` está reservado para destinatarios técnicos que ya fueron
 * escritos en el formato exacto de Meta (por ejemplo, un smoke test). En ese
 * modo solo se recortan los extremos y se valida que haya dígitos; no se
 * reescribe el número.
 */
export function formatPhoneForWhatsApp(
  phone: string,
  format: WhatsAppRecipientFormat = "internal",
) {
  const trimmedPhone = phone.trim();

  if (format === "meta-explicit") {
    return metaExplicitPhone(trimmedPhone);
  }

  if (format === "conversation") {
    return formatWhatsAppRecipientForSend(trimmedPhone);
  }

  const normalizedPhone = normalizePhone(trimmedPhone);
  const argentineMobile = normalizedPhone.match(ARGENTINE_MOBILE_WITH_NINE);

  // Cloud API acepta estos móviles argentinos sin el 9 internacional.
  return argentineMobile ? `54${argentineMobile[1]}` : normalizedPhone;
}

/**
 * Produce las variantes internas posibles de un wa_id sin modificar el valor
 * recibido de Meta. Argentina puede conservar el 9 en phoneNormalized aunque
 * Cloud API entregue el número sin ese dígito internacional.
 */
export function getInternalPhoneCandidatesForWhatsApp(whatsAppPhone: string) {
  const metaPhone = formatPhoneForWhatsApp(whatsAppPhone, "meta-explicit");
  const candidates = new Set([metaPhone]);
  const argentineMobile = metaPhone.match(/^54(\d{10})$/);
  if (argentineMobile) candidates.add(`549${argentineMobile[1]}`);
  return [...candidates];
}
