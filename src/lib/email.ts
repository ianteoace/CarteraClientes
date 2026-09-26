const MAX_EMAIL_LENGTH = 254;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailValidationError extends Error {}

export function normalizeOptionalEmail(value: string | null | undefined) {
  const email = value?.trim().toLocaleLowerCase() ?? "";
  if (!email) return null;
  if (email.length > MAX_EMAIL_LENGTH || !BASIC_EMAIL_PATTERN.test(email)) {
    throw new EmailValidationError("Ingresá un email válido.");
  }
  return email;
}
