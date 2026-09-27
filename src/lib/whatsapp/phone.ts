import { normalizePhone, PhoneNormalizationError } from "@/lib/phone";

export type WhatsAppRecipientFormat = "internal" | "meta-explicit";

/**
 * Adapta un teléfono interno al formato esperado por Meta.
 *
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
    if (!trimmedPhone || !/^\d+$/.test(trimmedPhone)) {
      throw new PhoneNormalizationError();
    }

    return trimmedPhone;
  }

  const normalizedPhone = normalizePhone(trimmedPhone);
  const argentineMobile = normalizedPhone.match(/^549(\d{10})$/);

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
