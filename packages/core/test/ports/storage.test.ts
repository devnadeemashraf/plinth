import { describe, expect, it } from "vitest";
import { sanitizeStorageKey, validateStorageKey } from "@/ports/storage.js";

describe("Storage Port - Key Validation & Path Traversal Guards", () => {
  it("should accept valid storage keys", () => {
    expect(validateStorageKey("avatars/tenant-123/user-456.png")).toBe(true);
    expect(validateStorageKey("exports/compliance-2026.json")).toBe(true);
    expect(validateStorageKey("public/logo.webp")).toBe(true);
  });

  it("should sanitize keys by normalizing slashes and removing leading slashes", () => {
    expect(sanitizeStorageKey("/avatars//tenant-1/user.png")).toBe("avatars/tenant-1/user.png");
    expect(sanitizeStorageKey("\\avatars\\tenant-1\\user.png")).toBe("avatars/tenant-1/user.png");
  });

  it("should reject keys attempting directory traversal with ..", () => {
    expect(validateStorageKey("../etc/passwd")).toBe(false);
    expect(validateStorageKey("avatars/../../secret.key")).toBe(false);
    expect(validateStorageKey("..\\windows\\system32")).toBe(false);
    expect(() => sanitizeStorageKey("../etc/passwd")).toThrow();
    expect(() => sanitizeStorageKey("avatars/../../secret.key")).toThrow();
  });

  it("should reject keys containing null bytes or control characters", () => {
    expect(validateStorageKey("avatars/user.png\0.exe")).toBe(false);
    expect(validateStorageKey("avatars/user\x1b.png")).toBe(false);
    expect(() => sanitizeStorageKey("avatars/user.png\0.exe")).toThrow();
  });

  it("should reject empty or whitespace-only keys", () => {
    expect(validateStorageKey("")).toBe(false);
    expect(validateStorageKey("   ")).toBe(false);
    expect(() => sanitizeStorageKey("")).toThrow();
    expect(() => sanitizeStorageKey("   ")).toThrow();
  });
});
