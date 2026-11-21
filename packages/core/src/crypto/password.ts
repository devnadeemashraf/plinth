import { hash, verify } from "@node-rs/argon2";
import { BadRequestError } from "@/errors/index.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128; // Defense against memory exhaustion DoS

// Production parameters for Argon2id (RFC 9106 recommended interactive profile)
const ARGON2_CONFIG = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2, // 2 iterations
  parallelism: 1, // 1 thread
  outputLen: 32, // 32 bytes
};

/**
 * Validates that a password meets minimum complexity/length bounds.
 * Bounds: between 8 and 128 characters inclusive.
 */
export function validatePasswordStrength(password: string): void {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, {
      code: "PASSWORD_TOO_SHORT",
    });
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestError(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`, {
      code: "PASSWORD_TOO_LONG",
    });
  }
}

/**
 * Hashes a plaintext password using Argon2id.
 * Validates password length first to prevent memory exhaustion DoS.
 */
export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password);
  return await hash(password, ARGON2_CONFIG);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Returns false cleanly without throwing if the hash is malformed.
 */
export async function verifyPassword(
  hashString: string,
  candidatePassword: string,
): Promise<boolean> {
  if (!hashString || !candidatePassword || typeof hashString !== "string") {
    return false;
  }

  try {
    return await verify(hashString, candidatePassword);
  } catch {
    return false;
  }
}

/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 * Protects against case-sensitivity spoofing and collision attacks.
 */
export function normalizeEmail(email: string): string {
  if (typeof email !== "string") {
    return "";
  }
  return email.trim().toLowerCase();
}

/**
 * Normalizes a username by trimming whitespace and converting to lowercase.
 */
export function normalizeUsername(username: string): string {
  if (typeof username !== "string") {
    return "";
  }
  return username.trim().toLowerCase();
}
