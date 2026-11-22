import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { LocalStorageAdapter } from "@plinth/adapter-storage-local";
import { describe, expect, it } from "vitest";

const tempDir = resolve(".tmp-storage-specific");

describe("LocalStorageAdapter - Specific Features", () => {
  it("should verify valid signed URLs and reject expired or tampered signatures", async () => {
    const adapter = new LocalStorageAdapter({
      baseDir: tempDir,
      signedUrlSecret: "super-secret-test-key-32-chars-long!",
    });

    const key = "avatars/user-1.png";
    const signed = await adapter.getSignedUrl({
      key,
      operation: "getObject",
      expiresInSeconds: 10,
    });

    const url = new URL(signed.signedUrl);
    const expires = url.searchParams.get("expires") ?? "";
    const sig = url.searchParams.get("sig") ?? "";
    const op = url.searchParams.get("op") ?? "";

    expect(adapter.verifySignedUrl(key, op, expires, sig)).toBe(true);

    // Tampered signature
    expect(adapter.verifySignedUrl(key, op, expires, `${sig}tampered`)).toBe(false);

    // Tampered key
    expect(adapter.verifySignedUrl("avatars/other.png", op, expires, sig)).toBe(false);

    // Expired timestamp
    const expiredTimestamp = (Date.now() - 5000).toString();
    const expiredSig = adapter.computeSignature(key, op, expiredTimestamp);
    expect(adapter.verifySignedUrl(key, op, expiredTimestamp, expiredSig)).toBe(false);

    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("should strictly reject path traversal keys at adapter boundary", async () => {
    const adapter = new LocalStorageAdapter({ baseDir: tempDir });
    await expect(adapter.headObject({ key: "../outside.txt" })).rejects.toThrow();
  });
});
