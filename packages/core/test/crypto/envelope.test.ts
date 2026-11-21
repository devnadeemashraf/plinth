import { describe, expect, it } from "vitest";
import { decryptEnvelope, encryptEnvelope, validateMasterKeyEntropy } from "@/crypto/envelope.js";
import { AppError } from "@/errors/app-error.js";

describe("Crypto: AES-256-GCM Envelope Encryption (5-Category Matrix)", () => {
  // A valid 32-byte master key with high entropy (32 distinct bytes)
  const validMasterKey = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256));

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("encrypts and decrypts a plaintext string successfully", () => {
      const plaintext = "super-secret-oauth-client-secret-12345";
      const envelope = encryptEnvelope(plaintext, validMasterKey);

      expect(envelope).toBeTypeOf("string");
      expect(envelope.startsWith("enc:v1:")).toBe(true);

      const decrypted = decryptEnvelope(envelope, validMasterKey);
      expect(decrypted.toString("utf8")).toBe(plaintext);
    });

    it("encrypts and decrypts an empty string", () => {
      const envelope = encryptEnvelope("", validMasterKey);
      const decrypted = decryptEnvelope(envelope, validMasterKey);
      expect(decrypted.toString("utf8")).toBe("");
    });

    it("encrypts and decrypts binary Buffer data", () => {
      const binaryData = Buffer.from([0x00, 0xde, 0xad, 0xbe, 0xef, 0xff, 0x42]);
      const envelope = encryptEnvelope(binaryData, validMasterKey);
      const decrypted = decryptEnvelope(envelope, validMasterKey);
      expect(decrypted).toEqual(binaryData);
    });

    it("encrypts and decrypts complex JSON strings", () => {
      const payload = JSON.stringify({
        clientId: "my-client-id",
        clientSecret: "top-secret-value-!@#$%",
        scopes: ["openid", "profile", "email"],
        endpoints: { token: "https://auth.example.com/oauth/token" },
      });
      const envelope = encryptEnvelope(payload, validMasterKey);
      const decrypted = decryptEnvelope(envelope, validMasterKey);
      expect(JSON.parse(decrypted.toString("utf8"))).toEqual(JSON.parse(payload));
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("handles 1 MB payload encryption and decryption without truncation", () => {
      const largePayload = "A".repeat(1024 * 1024); // 1 MB
      const envelope = encryptEnvelope(largePayload, validMasterKey);
      const decrypted = decryptEnvelope(envelope, validMasterKey);
      expect(decrypted.toString("utf8")).toBe(largePayload);
    });

    it("handles multi-byte UTF-8, unicode and emoji correctly", () => {
      const unicodeString = "🔒 密钥 / ключ / パスワード / secret 🚀 💖";
      const envelope = encryptEnvelope(unicodeString, validMasterKey);
      const decrypted = decryptEnvelope(envelope, validMasterKey);
      expect(decrypted.toString("utf8")).toBe(unicodeString);
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("generates unique ciphertexts and IVs for identical plaintexts (fresh DEK & IV per call)", () => {
      const plaintext = "constant-secret-value";
      const envelope1 = encryptEnvelope(plaintext, validMasterKey);
      const envelope2 = encryptEnvelope(plaintext, validMasterKey);

      expect(envelope1).not.toBe(envelope2);
      expect(decryptEnvelope(envelope1, validMasterKey).toString("utf8")).toBe(plaintext);
      expect(decryptEnvelope(envelope2, validMasterKey).toString("utf8")).toBe(plaintext);
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("throws when decrypting with wrong 32-byte master key", () => {
      const differentMasterKey = Buffer.from(
        Array.from({ length: 32 }, (_, i) => (i * 11 + 5) % 256),
      );
      const envelope = encryptEnvelope("secret", validMasterKey);

      expect(() => decryptEnvelope(envelope, differentMasterKey)).toThrow(AppError);
    });

    it("throws when envelope format is malformed or missing prefix", () => {
      expect(() => decryptEnvelope("invalid-envelope", validMasterKey)).toThrow(AppError);
      expect(() => decryptEnvelope("enc:v2:badversion", validMasterKey)).toThrow(AppError);
    });

    it("throws when envelope JSON payload is corrupted", () => {
      expect(() => decryptEnvelope("enc:v1:not-valid-base64-json@@@", validMasterKey)).toThrow(
        AppError,
      );
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("rejects master key with invalid byte length (< 32 or > 32 bytes)", () => {
      const shortKey = Buffer.alloc(16, 0x42);
      const longKey = Buffer.alloc(64, 0x42);

      expect(() => encryptEnvelope("secret", shortKey)).toThrow(AppError);
      expect(() => encryptEnvelope("secret", longKey)).toThrow(AppError);
    });

    it("rejects low-entropy master keys (fewer than 16 distinct bytes)", () => {
      const allZerosKey = Buffer.alloc(32, 0x00);
      const repeatedByteKey = Buffer.alloc(32, 0xaa);
      const lowEntropyKey = Buffer.from(
        "0102030405060708010203040506070801020304050607080102030405060708",
        "hex",
      ); // only 8 distinct bytes

      expect(() => validateMasterKeyEntropy(allZerosKey)).toThrow(AppError);
      expect(() => validateMasterKeyEntropy(repeatedByteKey)).toThrow(AppError);
      expect(() => validateMasterKeyEntropy(lowEntropyKey)).toThrow(AppError);

      expect(() => encryptEnvelope("secret", allZerosKey)).toThrow(AppError);
    });

    it("fails authentication and returns NO plaintext if ciphertext is tampered (AES-GCM integrity)", () => {
      const envelope = encryptEnvelope("sensitive-banking-pin-9999", validMasterKey);
      const base64Data = envelope.slice("enc:v1:".length);
      const parsed = JSON.parse(Buffer.from(base64Data, "base64url").toString("utf8"));

      // Flip a bit in the ciphertext
      const ctBuf = Buffer.from(parsed.ct, "base64url");
      ctBuf[0] = (ctBuf[0] ?? 0) ^ 0x01;
      parsed.ct = ctBuf.toString("base64url");

      const tamperedEnvelope = `enc:v1:${Buffer.from(JSON.stringify(parsed)).toString("base64url")}`;
      expect(() => decryptEnvelope(tamperedEnvelope, validMasterKey)).toThrow(AppError);
    });

    it("fails authentication if auth tag is tampered", () => {
      const envelope = encryptEnvelope("sensitive-data", validMasterKey);
      const base64Data = envelope.slice("enc:v1:".length);
      const parsed = JSON.parse(Buffer.from(base64Data, "base64url").toString("utf8"));

      // Flip a bit in auth tag
      const tagBuf = Buffer.from(parsed.tag, "base64url");
      tagBuf[0] = (tagBuf[0] ?? 0) ^ 0x01;
      parsed.tag = tagBuf.toString("base64url");

      const tamperedEnvelope = `enc:v1:${Buffer.from(JSON.stringify(parsed)).toString("base64url")}`;
      expect(() => decryptEnvelope(tamperedEnvelope, validMasterKey)).toThrow(AppError);
    });

    it("rejects envelope when DEK tag or data tag length is not 16 bytes", () => {
      const envelope = encryptEnvelope("data", validMasterKey);
      const base64Data = envelope.slice("enc:v1:".length);

      const parsedDekTag = JSON.parse(Buffer.from(base64Data, "base64url").toString("utf8"));
      parsedDekTag.dekTag = Buffer.alloc(8).toString("base64url");
      const badDekTagEnvelope = `enc:v1:${Buffer.from(JSON.stringify(parsedDekTag)).toString("base64url")}`;
      expect(() => decryptEnvelope(badDekTagEnvelope, validMasterKey)).toThrow(AppError);

      const parsedDataTag = JSON.parse(Buffer.from(base64Data, "base64url").toString("utf8"));
      parsedDataTag.tag = Buffer.alloc(8).toString("base64url");
      const badDataTagEnvelope = `enc:v1:${Buffer.from(JSON.stringify(parsedDataTag)).toString("base64url")}`;
      expect(() => decryptEnvelope(badDataTagEnvelope, validMasterKey)).toThrow(AppError);
    });
  });
});
