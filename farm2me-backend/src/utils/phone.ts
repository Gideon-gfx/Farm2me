// Nigerian phone-number normalisation.
//
// Accepts either local (0XXXXXXXXXX) or international (+234XXXXXXXXXX / 234...)
// formats and returns the canonical E.164 form: +234XXXXXXXXXX.
//
// Nigerian mobile subscriber numbers are 10 digits and begin with 7, 8 or 9
// followed by 0 or 1 (e.g. 0803..., 0701..., 0901...).

const SUBSCRIBER = /^[789][01]\d{8}$/;

export class InvalidPhoneNumberError extends Error {
  constructor(input: string) {
    super(`Invalid Nigerian phone number: ${input}`);
    this.name = "InvalidPhoneNumberError";
  }
}

/**
 * Normalises a Nigerian phone number to E.164 (+234XXXXXXXXXX).
 * Throws {@link InvalidPhoneNumberError} when the input is not a valid number.
 */
export function normalizeNigerianPhone(raw: string): string {
  const trimmed = raw.replace(/[\s-]/g, "");
  let subscriber: string | null = null;

  if (/^0\d{10}$/.test(trimmed)) {
    // Local format: leading 0 + 10-digit subscriber number.
    subscriber = trimmed.slice(1);
  } else if (/^\+234\d{10}$/.test(trimmed)) {
    subscriber = trimmed.slice(4);
  } else if (/^234\d{10}$/.test(trimmed)) {
    subscriber = trimmed.slice(3);
  }

  if (!subscriber || !SUBSCRIBER.test(subscriber)) {
    throw new InvalidPhoneNumberError(raw);
  }

  return `+234${subscriber}`;
}

/** Non-throwing variant used by Zod refinements. */
export function isValidNigerianPhone(raw: string): boolean {
  try {
    normalizeNigerianPhone(raw);
    return true;
  } catch {
    return false;
  }
}
