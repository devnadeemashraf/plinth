import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { UnauthorizedError } from "@/errors/index.js";

export interface Ed25519KeyPair {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

export interface Ed25519PublicJwk {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly kid?: string;
  readonly x: string;
}

export interface JwtClaims {
  readonly sub: string;
  readonly iss?: string;
  readonly aud?: string;
  readonly exp?: number;
  readonly nbf?: number;
  readonly iat?: number;
  readonly jti?: string;
  readonly [key: string]: unknown;
}

export interface JwtVerifyOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly clockSkewSec?: number;
}

/**
 * Generates an Ed25519 private/public keypair encoded as PKCS#8 / SPKI PEM strings.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
  };
}

/**
 * Exports an Ed25519 public key as an RFC 8037 JSON Web Key (JWK) for JWKS discovery endpoints.
 */
export function exportEd25519PublicJwk(publicKeyPem: string, keyId?: string): Ed25519PublicJwk {
  const pubKey = createPublicKey(publicKeyPem);
  const jwk = pubKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string };

  const result: Ed25519PublicJwk = {
    kty: "OKP",
    crv: "Ed25519",
    x: jwk.x,
  };

  if (keyId) {
    return { ...result, kid: keyId };
  }
  return result;
}

/**
 * Signs a JWT payload using Ed25519 EdDSA signature.
 * Enforces alg: "EdDSA" in the protected header.
 */
export function signEd25519Jwt(claims: JwtClaims, privateKeyPem: string): string {
  const header = {
    alg: "EdDSA",
    typ: "JWT",
  };

  const headerB64 = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(signingInput, "utf8"), privateKey);
  const signatureB64 = signature.toString("base64url");

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verifies and decodes an Ed25519 EdDSA JWT.
 * Enforces algorithm check (strictly EdDSA), signature verification, expiration,
 * not-before, and optional issuer/audience constraints.
 */
export function verifyEd25519Jwt(
  token: string,
  publicKeyPem: string,
  options: JwtVerifyOptions = {},
): JwtClaims {
  if (typeof token !== "string") {
    throw new UnauthorizedError("JWT token must be a string.", {
      code: "INVALID_TOKEN_FORMAT",
    });
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new UnauthorizedError(
      "JWT must contain exactly three segments (header.payload.signature).",
      {
        code: "INVALID_TOKEN_FORMAT",
      },
    );
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // 1. Validate Protected Header
  let header: { alg?: string; typ?: string };
  try {
    const headerStr = Buffer.from(headerB64, "base64url").toString("utf8");
    header = JSON.parse(headerStr) as { alg?: string; typ?: string };
  } catch {
    throw new UnauthorizedError("JWT header is malformed base64url or JSON.", {
      code: "MALFORMED_JWT_HEADER",
    });
  }

  // Strict defense against alg: none and algorithm confusion attacks
  if (header.alg !== "EdDSA") {
    throw new UnauthorizedError(
      `Unsupported algorithm: '${header.alg ?? "none"}'. Only EdDSA is permitted.`,
      {
        code: "UNSUPPORTED_JWT_ALGORITHM",
      },
    );
  }

  // 2. Verify Cryptographic Signature
  const signingInput = `${headerB64}.${payloadB64}`;
  let signatureBuf: Buffer;
  try {
    signatureBuf = Buffer.from(signatureB64, "base64url");
  } catch {
    throw new UnauthorizedError("JWT signature segment is not valid base64url.", {
      code: "MALFORMED_JWT_SIGNATURE",
    });
  }

  try {
    const publicKey = createPublicKey(publicKeyPem);
    const isValid = verify(null, Buffer.from(signingInput, "utf8"), publicKey, signatureBuf);
    if (!isValid) {
      throw new Error("Invalid signature");
    }
  } catch {
    throw new UnauthorizedError("JWT signature verification failed.", {
      code: "INVALID_JWT_SIGNATURE",
    });
  }

  // 3. Decode Payload Claims
  let payload: JwtClaims;
  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    payload = JSON.parse(payloadStr) as JwtClaims;
  } catch {
    throw new UnauthorizedError("JWT payload is malformed base64url or JSON.", {
      code: "MALFORMED_JWT_PAYLOAD",
    });
  }

  // 4. Validate Standard Claims (exp, nbf, iss, aud)
  const now = Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSec ?? 0;

  if (typeof payload.exp === "number" && payload.exp + skew < now) {
    throw new UnauthorizedError("JWT token has expired.", {
      code: "TOKEN_EXPIRED",
    });
  }

  if (typeof payload.nbf === "number" && payload.nbf - skew > now) {
    throw new UnauthorizedError("JWT token is not active yet (nbf claim).", {
      code: "TOKEN_NOT_YET_VALID",
    });
  }

  if (options.issuer && payload.iss !== options.issuer) {
    throw new UnauthorizedError(
      `Token issuer mismatch: expected '${options.issuer}', got '${payload.iss ?? "undefined"}'.`,
      {
        code: "INVALID_ISSUER",
      },
    );
  }

  if (options.audience && payload.aud !== options.audience) {
    throw new UnauthorizedError(
      `Token audience mismatch: expected '${options.audience}', got '${payload.aud ?? "undefined"}'.`,
      {
        code: "INVALID_AUDIENCE",
      },
    );
  }

  return payload;
}
