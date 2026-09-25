export class PhoneNormalizationError extends Error {
  constructor(message = "Ingresá un teléfono válido que contenga únicamente dígitos.") {
    super(message);
    this.name = "PhoneNormalizationError";
  }
}

/** Convierte un teléfono al formato canónico usado para identificaciones internas. */
export function normalizePhone(phone: string) {
  const normalizedPhone = phone.replace(/[+\s\-()]/g, "");

  if (!normalizedPhone || !/^\d+$/.test(normalizedPhone)) {
    throw new PhoneNormalizationError();
  }

  return normalizedPhone;
}

export function tryNormalizePhone(phone: string) {
  try {
    return normalizePhone(phone);
  } catch (error) {
    if (error instanceof PhoneNormalizationError) {
      return null;
    }

    throw error;
  }
}
