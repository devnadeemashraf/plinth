/**
 * Email Port & Delivery Contracts
 *
 * Defines the Hexagonal Email Port supporting local stubs (Dev/Admin Email Catcher)
 * and production SMTP/SES/Resend adapters with header injection protection.
 */

export interface EmailRecipient {
  readonly email: string;
  readonly name?: string | undefined;
}

export type EmailAddress = string | EmailRecipient;

export interface SendEmailInput {
  readonly from?: EmailAddress | undefined;
  readonly to: EmailAddress | readonly EmailAddress[];
  readonly cc?: EmailAddress | readonly EmailAddress[] | undefined;
  readonly bcc?: EmailAddress | readonly EmailAddress[] | undefined;
  readonly replyTo?: EmailAddress | undefined;
  readonly subject: string;
  readonly text?: string | undefined;
  readonly html?: string | undefined;
  readonly headers?: Record<string, string> | undefined;
}

export interface SendEmailResult {
  readonly messageId: string;
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
}

export interface EmailPort {
  /**
   * Sends an email through the underlying transport.
   */
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

// Bounded email regex to prevent ReDoS while validating address syntax
const EMAIL_SYNTAX_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Detection of CRLF injection and null-byte injection in email headers, subjects, or addresses
const CRLF_INJECTION_REGEX = /[\r\n\0]/;

/**
 * Validates and normalizes an email address string.
 * Throws an error on CRLF or null-byte injection attempts or invalid format.
 */
export function normalizeEmailAddress(address: EmailAddress): { email: string; name?: string } {
  if (typeof address === "string") {
    const trimmed = address.trim();
    if (CRLF_INJECTION_REGEX.test(trimmed)) {
      throw new Error("Invalid email address: CRLF injection detected (or null byte)");
    }
    if (!EMAIL_SYNTAX_REGEX.test(trimmed)) {
      throw new Error(`Invalid email address format: ${trimmed}`);
    }
    return { email: trimmed.toLowerCase() };
  }

  const emailTrimmed = address.email.trim();
  if (CRLF_INJECTION_REGEX.test(emailTrimmed)) {
    throw new Error("Invalid email address: CRLF injection detected (or null byte)");
  }
  if (!EMAIL_SYNTAX_REGEX.test(emailTrimmed)) {
    throw new Error(`Invalid email address format: ${emailTrimmed}`);
  }

  const name = address.name?.trim();
  if (name && CRLF_INJECTION_REGEX.test(name)) {
    throw new Error("Invalid recipient name: CRLF injection detected (or null byte)");
  }

  return {
    email: emailTrimmed.toLowerCase(),
    ...(name ? { name } : {}),
  };
}

/**
 * Validates email subject to prevent header injection attacks.
 */
export function validateEmailSubject(subject: string): string {
  if (CRLF_INJECTION_REGEX.test(subject)) {
    throw new Error("Invalid email subject: CRLF injection detected (or null byte)");
  }
  return subject;
}
