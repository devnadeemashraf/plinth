import { describe, expect, it } from "vitest";
import {
  exportEd25519PublicJwk,
  generateEd25519KeyPair,
  signEd25519Jwt,
  verifyEd25519Jwt,
} from "@/crypto/jwt-ed25519.js";
import { AppError } from "@/errors/app-error.js";

describe("Crypto: EdDSA (Ed25519) JSON Web Token (5-Category Matrix)", () => {
  const keys = generateEd25519KeyPair();

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("generates a valid Ed25519 key pair with PEM strings", () => {
      expect(keys.privateKeyPem).toContain("BEGIN PRIVATE KEY");
      expect(keys.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    });

    it("signs and verifies an Ed25519 JWT successfully", () => {
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        sub: "usr_0123456789abcdef",
        iss: "https://api.plinth.dev",
        aud: "plinth-api",
        exp: now + 900, // 15 mins
        roles: ["admin", "developer"],
      };

      const token = signEd25519Jwt(claims, keys.privateKeyPem);
      expect(token).toBeTypeOf("string");
      expect(token.split(".").length).toBe(3);

      const verified = verifyEd25519Jwt(token, keys.publicKeyPem, {
        issuer: "https://api.plinth.dev",
        audience: "plinth-api",
      });

      expect(verified.sub).toBe("usr_0123456789abcdef");
      expect(verified["roles"]).toEqual(["admin", "developer"]);
      expect(verified.iss).toBe("https://api.plinth.dev");
      expect(verified.aud).toBe("plinth-api");
    });

    it("exports a valid RFC 8037 Ed25519 JWK", () => {
      const jwk = exportEd25519PublicJwk(keys.publicKeyPem, "key-1");
      expect(jwk.kty).toBe("OKP");
      expect(jwk.crv).toBe("Ed25519");
      expect(jwk.kid).toBe("key-1");
      expect(jwk.x).toBeTypeOf("string");
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("handles large custom claims (within 4 KB bound)", () => {
      const largeMetadata = { info: "X".repeat(2000) };
      const now = Math.floor(Date.now() / 1000);
      const token = signEd25519Jwt(
        { sub: "usr_1", exp: now + 300, meta: largeMetadata },
        keys.privateKeyPem,
      );

      const verified = verifyEd25519Jwt(token, keys.publicKeyPem);
      expect(verified["meta"]).toEqual(largeMetadata);
    });

    it("accepts token when current time is within acceptable clock skew (5 seconds)", () => {
      const now = Math.floor(Date.now() / 1000);
      // Expired 2 seconds ago
      const token = signEd25519Jwt({ sub: "usr_1", exp: now - 2 }, keys.privateKeyPem);

      // Verifying with 5-second skew tolerance should pass
      const verified = verifyEd25519Jwt(token, keys.publicKeyPem, { clockSkewSec: 5 });
      expect(verified.sub).toBe("usr_1");
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("signs concurrently without state collision", () => {
      const now = Math.floor(Date.now() / 1000);
      const tokens = Array.from({ length: 10 }, (_, i) =>
        signEd25519Jwt({ sub: `usr_${i}`, exp: now + 300 }, keys.privateKeyPem),
      );

      tokens.forEach((tok, i) => {
        const payload = verifyEd25519Jwt(tok, keys.publicKeyPem);
        expect(payload.sub).toBe(`usr_${i}`);
      });
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("rejects token with missing segments (only 2 parts)", () => {
      expect(() => verifyEd25519Jwt("header.payload", keys.publicKeyPem)).toThrow(AppError);
    });

    it("rejects token with extra segments (4 parts)", () => {
      expect(() => verifyEd25519Jwt("h.p.s.extra", keys.publicKeyPem)).toThrow(AppError);
    });

    it("rejects token with corrupted base64url payload", () => {
      expect(() => verifyEd25519Jwt("bad!header.bad!payload.sig", keys.publicKeyPem)).toThrow(
        AppError,
      );
    });

    it("rejects token with tampered signature bytes", () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signEd25519Jwt({ sub: "usr_1", exp: now + 300 }, keys.privateKeyPem);
      const [h, p, s] = token.split(".") as [string, string, string];

      const sigBuf = Buffer.from(s, "base64url");
      sigBuf[0] = (sigBuf[0] ?? 0) ^ 0x01;
      const tampered = `${h}.${p}.${sigBuf.toString("base64url")}`;

      expect(() => verifyEd25519Jwt(tampered, keys.publicKeyPem)).toThrow(AppError);
    });

    it("rejects verification when using wrong Ed25519 public key", () => {
      const otherKeys = generateEd25519KeyPair();
      const now = Math.floor(Date.now() / 1000);
      const token = signEd25519Jwt({ sub: "usr_1", exp: now + 300 }, keys.privateKeyPem);

      expect(() => verifyEd25519Jwt(token, otherKeys.publicKeyPem)).toThrow(AppError);
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("STRICTLY REJECTS alg: none attack", () => {
      const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const p = Buffer.from(
        JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 900 }),
      ).toString("base64url");
      const noneToken = `${h}.${p}.`;

      expect(() => verifyEd25519Jwt(noneToken, keys.publicKeyPem)).toThrow(AppError);
    });

    it("STRICTLY REJECTS algorithm confusion (e.g. HS256, RS256)", () => {
      const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const p = Buffer.from(
        JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 900 }),
      ).toString("base64url");
      const fakeToken = `${h}.${p}.fakesig`;

      expect(() => verifyEd25519Jwt(fakeToken, keys.publicKeyPem)).toThrow(AppError);
    });

    it("rejects expired token when exp is in the past", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = signEd25519Jwt({ sub: "usr_1", exp: now - 10 }, keys.privateKeyPem);

      expect(() => verifyEd25519Jwt(expiredToken, keys.publicKeyPem)).toThrow(AppError);
    });

    it("rejects token where nbf (not before) is in the future", () => {
      const now = Math.floor(Date.now() / 1000);
      const futureToken = signEd25519Jwt(
        { sub: "usr_1", nbf: now + 60, exp: now + 300 },
        keys.privateKeyPem,
      );

      expect(() => verifyEd25519Jwt(futureToken, keys.publicKeyPem)).toThrow(AppError);
    });

    it("rejects token when issuer does not match expected issuer", () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signEd25519Jwt(
        { sub: "usr_1", iss: "https://malicious.com", exp: now + 300 },
        keys.privateKeyPem,
      );

      expect(() =>
        verifyEd25519Jwt(token, keys.publicKeyPem, { issuer: "https://api.plinth.dev" }),
      ).toThrow(AppError);
    });

    it("exports public JWK without kid when keyId is omitted", () => {
      const jwk = exportEd25519PublicJwk(keys.publicKeyPem);
      expect(jwk.kty).toBe("OKP");
      expect(jwk.crv).toBe("Ed25519");
      expect(jwk.kid).toBeUndefined();
    });

    it("rejects non-string tokens and malformed payload JSON", () => {
      expect(() => verifyEd25519Jwt(123 as unknown as string, keys.publicKeyPem)).toThrow(AppError);

      const headerB64 = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString(
        "base64url",
      );
      const badPayloadB64 = Buffer.from("not-a-valid-json").toString("base64url");
      const malformedPayloadToken = `${headerB64}.${badPayloadB64}.dummy-sig`;

      expect(() => verifyEd25519Jwt(malformedPayloadToken, keys.publicKeyPem)).toThrow(AppError);
    });
  });
});
