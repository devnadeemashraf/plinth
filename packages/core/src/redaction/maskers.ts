const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const AADHAAR_REGEX = /^[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}$/;
const EMAIL_REGEX = /^([^@]+)@([^@]+)$/;

export function maskEmail(email: string): string {
  if (email === "") {
    return "";
  }
  const match = EMAIL_REGEX.exec(email.trim());
  if (!match) {
    return "[REDACTED_EMAIL]";
  }
  const local = match[1] as string;
  const domain = match[2] as string;
  if (local.length <= 2) {
    return "[REDACTED_EMAIL]";
  }
  const first = local[0];
  const last = local[local.length - 1];
  return `${first}***${last}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone === "") {
    return "";
  }
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly.length < 7) {
    return "[REDACTED_PHONE]";
  }

  // Handle "+91 9876543210" style
  if (phone.startsWith("+91 ") && digitsOnly.length === 12) {
    const last5 = phone.slice(-5);
    return `+91 ***** ${last5}`;
  }

  // Handle "+1 (555) 123-4567" style
  if (/^\+1\s*\(\d{3}\)\s*\d{3}-\d{4}$/.test(phone)) {
    const last4 = phone.slice(-4);
    return `+1 (***) ***-${last4}`;
  }

  // Default fallback: mask all but last 4 digits
  let masked = "";
  let digitsRemaining = digitsOnly.length - 4;
  for (let i = 0; i < phone.length; i++) {
    const ch = phone[i] as string;
    if (/\d/.test(ch)) {
      if (digitsRemaining > 0) {
        masked += "*";
        digitsRemaining--;
      } else {
        masked += ch;
      }
    } else {
      masked += ch;
    }
  }
  return masked;
}

export function maskCreditCard(card: string): string {
  if (card.length <= 4) {
    return card;
  }
  const digitsOnly = card.replace(/\D/g, "");
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return card;
  }

  // Preserve spaces if formatted e.g. "4111 2222 3333 4444"
  if (card.includes(" ")) {
    const parts = card.split(" ");
    const last = parts[parts.length - 1];
    return `${parts
      .slice(0, -1)
      .map(() => "****")
      .join(" ")} ${last}`;
  }

  const last4 = card.slice(-4);
  const asterisks = "*".repeat(card.length - 4);
  return `${asterisks}${last4}`;
}

export function maskPan(pan: string): string {
  if (PAN_REGEX.test(pan.trim())) {
    return "[REDACTED_PAN]";
  }
  return pan;
}

export function maskAadhaar(aadhaar: string): string {
  if (AADHAAR_REGEX.test(aadhaar.trim())) {
    return "[REDACTED_AADHAAR]";
  }
  return aadhaar;
}

export function maskToken(token: string): string {
  if (token.startsWith("Bearer ")) {
    return "Bearer [REDACTED_TOKEN]";
  }
  return "[REDACTED_TOKEN]";
}
