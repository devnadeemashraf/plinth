import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestError } from "@/errors/index.js";

const MIN_TOKEN_BYTES = 16;

/**
 * Generates a cryptographically secure random token in base64url encoding.
 * Enforces a minimum entropy of 16 bytes (128 bits).
 */
export function generateSecureToken(bytes = 32): string {
  if (bytes < MIN_TOKEN_BYTES) {
    throw new BadRequestError(`Secure token must be at least ${MIN_TOKEN_BYTES} bytes.`, {
      code: "INSUFFICIENT_TOKEN_ENTROPY",
    });
  }

  return randomBytes(bytes).toString("base64url");
}

/**
 * Computes a SHA-256 hash of a sensitive token (such as session tokens or refresh tokens)
 * for safe at-rest storage in the database.
 */
export function hashToken(token: string): string {
  if (!token || typeof token !== "string") {
    return "";
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

/**
 * Generates an RFC 7636 PKCE Code Verifier (64 random bytes -> 86 base64url chars)
 * and its S256 Code Challenge.
 */
export function generatePkce(): PkcePair {
  const codeVerifier = generateSecureToken(48);
  const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");

  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Verifies that a PKCE code verifier matches the expected code challenge using S256.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyPkce(codeVerifier: string, expectedChallenge: string): boolean {
  if (
    !codeVerifier ||
    !expectedChallenge ||
    typeof codeVerifier !== "string" ||
    typeof expectedChallenge !== "string"
  ) {
    return false;
  }

  const computedChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");

  return timingSafeEqualString(computedChallenge, expectedChallenge);
}

/**
 * Compares two strings in constant time to prevent side-channel timing attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
