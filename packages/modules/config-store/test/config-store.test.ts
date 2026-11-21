import { AppError } from "@plinth/core";
import { ConfigStore, InMemoryConfigStoreRepository } from "@plinth/modules-config-store";
import { beforeEach, describe, expect, it } from "vitest";

describe("ConfigStore: Runtime Encrypted Settings & Feature Flags (5-Category Matrix)", () => {
  const masterKey = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 9 + 17) % 256));
  let repository: InMemoryConfigStoreRepository;
  let store: ConfigStore;

  beforeEach(() => {
    repository = new InMemoryConfigStoreRepository();
    store = new ConfigStore({
      repository,
      masterKey,
      fallbacks: {
        "auth.emailPasswordEnabled": "true",
        "auth.oauthEnabled": "true",
        "app.maxUploadSize": "5242880",
      },
    });
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("gets fallback value when key is not stored in repository", async () => {
      const val = await store.get("auth.emailPasswordEnabled");
      expect(val).toBe("true");

      const boolVal = await store.getBoolean("auth.emailPasswordEnabled");
      expect(boolVal).toBe(true);
    });

    it("stores and retrieves a non-secret setting", async () => {
      await store.set("auth.emailPasswordEnabled", "false");
      const boolVal = await store.getBoolean("auth.emailPasswordEnabled");
      expect(boolVal).toBe(false);

      const strVal = await store.get("auth.emailPasswordEnabled");
      expect(strVal).toBe("false");
    });

    it("stores a secret setting with envelope encryption at rest, retrieving decrypted value", async () => {
      const secretValue = "top-secret-oauth-client-secret-999";
      await store.set("oauth.google.clientSecret", secretValue, { isSecret: true });

      // In-memory read returns the decrypted plaintext
      const decrypted = await store.get("oauth.google.clientSecret");
      expect(decrypted).toBe(secretValue);

      // Raw repository inspection proves value is encrypted with enc:v1: prefix
      const raw = await repository.get("oauth.google.clientSecret");
      expect(raw).not.toBeNull();
      expect(raw?.isSecret).toBe(true);
      expect(raw?.valueEncrypted.startsWith("enc:v1:")).toBe(true);
      expect(raw?.valueEncrypted).not.toContain(secretValue);
    });

    it("parses numbers with getNumber", async () => {
      const num = await store.getNumber("app.maxUploadSize");
      expect(num).toBe(5242880);

      await store.set("app.maxUploadSize", "10485760");
      expect(await store.getNumber("app.maxUploadSize")).toBe(10485760);
    });

    it("deletes a stored setting and reverts to fallback", async () => {
      await store.set("auth.emailPasswordEnabled", "false");
      expect(await store.getBoolean("auth.emailPasswordEnabled")).toBe(false);

      const deleted = await store.delete("auth.emailPasswordEnabled");
      expect(deleted).toBe(true);
      // Reverted to fallback
      expect(await store.getBoolean("auth.emailPasswordEnabled")).toBe(true);
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("handles boolean conversion across multiple truthy and falsy representations", async () => {
      await store.set("flag.1", "1");
      await store.set("flag.2", "true");
      await store.set("flag.3", "TRUE");
      await store.set("flag.4", "0");
      await store.set("flag.5", "false");
      await store.set("flag.6", "FALSE");

      expect(await store.getBoolean("flag.1")).toBe(true);
      expect(await store.getBoolean("flag.2")).toBe(true);
      expect(await store.getBoolean("flag.3")).toBe(true);
      expect(await store.getBoolean("flag.4")).toBe(false);
      expect(await store.getBoolean("flag.5")).toBe(false);
      expect(await store.getBoolean("flag.6")).toBe(false);
    });

    it("returns default value when key does not exist and no fallback is set", async () => {
      expect(await store.get("non.existent.key")).toBeUndefined();
      expect(await store.getBoolean("non.existent.key", true)).toBe(true);
      expect(await store.getNumber("non.existent.key", 42)).toBe(42);
      expect(Number.isNaN(await store.getNumber("non.existent.key"))).toBe(true);
      await store.set("invalid.num", "not-a-number");
      expect(await store.getNumber("invalid.num", 99)).toBe(99);
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("handles concurrent writes without corruption", async () => {
      await Promise.all([
        store.set("key.a", "val-a"),
        store.set("key.b", "val-b", { isSecret: true }),
        store.set("key.c", "val-c"),
      ]);

      expect(await store.get("key.a")).toBe("val-a");
      expect(await store.get("key.b")).toBe("val-b");
      expect(await store.get("key.c")).toBe("val-c");
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("throws AppError when attempting to read an encrypted secret if master key is missing", async () => {
      const storeWithoutKey = new ConfigStore({
        repository,
        // No master key provided
      });

      await store.set("secret.test", "confidential-data", { isSecret: true });

      await expect(storeWithoutKey.get("secret.test")).rejects.toThrow(AppError);
      await expect(storeWithoutKey.set("secret.new", "data", { isSecret: true })).rejects.toThrow(
        AppError,
      );
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("masks secret values when listing all settings", async () => {
      await store.set("public.name", "Plinth Platform");
      await store.set("private.stripeKey", "sk_live_123456789", { isSecret: true });

      const list = await store.list();
      const publicSetting = list.find((s) => s.key === "public.name");
      const secretSetting = list.find((s) => s.key === "private.stripeKey");

      expect(publicSetting?.value).toBe("Plinth Platform");
      expect(publicSetting?.isSecret).toBe(false);

      expect(secretSetting?.isSecret).toBe(true);
      expect(secretSetting?.value).toBe("[ENCRYPTED_SECRET]");
      expect(secretSetting?.value).not.toContain("sk_live_");

      await store.set("meta.author", "Alice", { updatedBy: "usr_alice" });
      const updatedList = await store.list();
      const authorSetting = updatedList.find((s) => s.key === "meta.author");
      expect(authorSetting?.updatedBy).toBe("usr_alice");
    });
  });
});
