import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AddOptions, addCommand } from "../src/commands/add.js";

describe("CLI add command — plinth add (5-Category TDD Matrix)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plinth-add-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("Category 1: Happy Path", () => {
    it("should provide add instructions for supported adapter", async () => {
      const options: AddOptions = {
        type: "adapter",
        name: "redis",
        projectDir: tmpDir,
      };

      const result = await addCommand(options);
      expect(result.success).toBe(true);
      expect(result.packageName).toBe("@plinth/adapter-cache-redis");
      expect(result.snippet).toContain("RedisCacheAdapter");
      expect(result.installCommand).toContain("pnpm add @plinth/adapter-cache-redis");
    });

    it("should provide add instructions for supported module", async () => {
      const options: AddOptions = {
        type: "module",
        name: "billing",
        projectDir: tmpDir,
      };

      const result = await addCommand(options);
      expect(result.success).toBe(true);
      expect(result.packageName).toBe("@plinth/modules-billing");
      expect(result.snippet).toContain("BillingService");
      expect(result.installCommand).toContain("pnpm add @plinth/modules-billing");
    });
  });

  describe("Category 2: Boundary & Fuzzing", () => {
    it("should reject unknown adapter name", async () => {
      await expect(
        addCommand({
          type: "adapter",
          name: "non-existent-adapter",
          projectDir: tmpDir,
        }),
      ).rejects.toThrow(/Unknown adapter/);
    });

    it("should reject unknown module name", async () => {
      await expect(
        addCommand({
          type: "module",
          name: "non-existent-module",
          projectDir: tmpDir,
        }),
      ).rejects.toThrow(/Unknown module/);
    });

    it("should reject invalid type parameter", async () => {
      await expect(
        addCommand({
          type: "invalid" as unknown as "adapter",
          name: "redis",
          projectDir: tmpDir,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Category 3: Concurrency & Idempotency", () => {
    it("should return identical output on repeated calls", async () => {
      const res1 = await addCommand({ type: "adapter", name: "postgres", projectDir: tmpDir });
      const res2 = await addCommand({ type: "adapter", name: "postgres", projectDir: tmpDir });
      expect(res1).toEqual(res2);
    });
  });

  describe("Category 4: Fault Injection", () => {
    it("should handle missing projectDir gracefully", async () => {
      const result = await addCommand({ type: "adapter", name: "stripe" });
      expect(result.success).toBe(true);
    });
  });

  describe("Category 5: Security & Abuse", () => {
    it("should reject traversal attacks in adapter or module name", async () => {
      await expect(
        addCommand({
          type: "adapter",
          name: "../../etc/passwd",
          projectDir: tmpDir,
        }),
      ).rejects.toThrow();
    });
  });
});
