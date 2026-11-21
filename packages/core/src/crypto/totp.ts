import { createHmac, randomBytes } from "node:crypto";
import { hashToken, timingSafeEqualString } from "@/crypto/tokens.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const MODULO = 10 ** DIGITS;

/**
 * Encodes a buffer into RFC 4648 Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | (buffer[i] ?? 0);
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into a Buffer.
 * Returns null if the string contains invalid characters.
 */
export function base32Decode(input: string): Buffer | null {
  const cleaned = input.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i] ?? "";
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      return null;
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export interface TotpSecretResult {
  readonly secret: string;
  readonly uri: string;
}

/**
 * Generates a 20-byte (160-bit) high-entropy Base32 TOTP secret and a standard otpauth:// URI.
 */
export function generateTotpSecret(issuer: string, accountName: string): TotpSecretResult {
  const secretBytes = randomBytes(20);
  const secret = base32Encode(secretBytes);

  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  const uri = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

  return { secret, uri };
}

/**
 * Generates an RFC 6238 6-digit TOTP code for a given timestamp.
 */
export function generateTotp(secretBase32: string, timestampMs = Date.now()): string {
  const key = base32Decode(secretBase32);
  if (!key) {
    return "";
  }

  const counter = Math.floor(timestampMs / 1000 / STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;

  const binaryCode =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const code = (binaryCode % MODULO).toString().padStart(DIGITS, "0");
  return code;
}

export interface TotpVerifyOptions {
  readonly window?: number; // Allowed clock drift in intervals (default 1 = +-30s)
  readonly timestampMs?: number;
}

/**
 * Verifies a 6-digit TOTP code against a Base32 secret with clock skew tolerance.
 * Uses timing-safe string comparison.
 */
export function verifyTotp(
  token: string,
  secretBase32: string,
  options: TotpVerifyOptions = {},
): boolean {
  if (!token || typeof token !== "string" || !/^\d{6}$/.test(token)) {
    return false;
  }

  const key = base32Decode(secretBase32);
  if (!key) {
    return false;
  }

  const window = options.window ?? 1;
  const now = options.timestampMs ?? Date.now();

  for (let offset = -window; offset <= window; offset++) {
    const checkTime = now + offset * STEP_SECONDS * 1000;
    const expected = generateTotp(secretBase32, checkTime);
    if (expected && timingSafeEqualString(token, expected)) {
      return true;
    }
  }

  return false;
}

export interface RecoveryCodesResult {
  readonly plaintextCodes: readonly string[];
  readonly hashedCodes: readonly string[];
}

/**
 * Generates cryptographically secure recovery codes and their SHA-256 hashes.
 */
export function generateRecoveryCodes(count = 8): RecoveryCodesResult {
  const plaintextCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    // 5 bytes = 10 hex characters formatted as XXXXX-XXXXX
    const raw = randomBytes(5).toString("hex").toLowerCase();
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plaintextCodes.push(formatted);
    hashedCodes.push(hashToken(formatted));
  }

  return {
    plaintextCodes,
    hashedCodes,
  };
}

/**
 * Verifies whether a candidate recovery code matches any of the stored hashed codes.
 */
export function verifyRecoveryCode(candidateCode: string, hashedCodes: readonly string[]): boolean {
  if (!candidateCode || typeof candidateCode !== "string") {
    return false;
  }
  const candidateHash = hashToken(candidateCode.trim().toLowerCase());

  for (const storedHash of hashedCodes) {
    if (timingSafeEqualString(candidateHash, storedHash)) {
      return true;
    }
  }

  return false;
}
