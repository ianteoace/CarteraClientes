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
