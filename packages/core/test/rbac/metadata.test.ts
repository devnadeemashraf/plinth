import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/primitives/result.js";
import { validateRoleMetadata } from "@/rbac/metadata.js";

describe("RBAC / Role Metadata & Size Bounds (5-Category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should accept valid role metadata with all supported fields", () => {
      const valid = {
        colorHex: "#ff5722",
        badgeLabel: "Staff Lead",
        icon: "shield-alert",
        description: "Assigned to primary engineering staff",
        custom: {
          department: "Platform Engineering",
          tier: 3,
          isAudited: true,
        },
      };

      const result = validateRoleMetadata(valid);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.colorHex).toBe("#ff5722");
        expect(result.value.badgeLabel).toBe("Staff Lead");
      }
    });

    it("should accept empty or minimal role metadata", () => {
      expect(isOk(validateRoleMetadata({}))).toBe(true);
      expect(isOk(validateRoleMetadata({ colorHex: "#fff" }))).toBe(true);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should accept serialized payload of exactly <= 4096 bytes", () => {
      // Create padding object to get close to 4096 bytes
      const bigDescription = "A".repeat(250);
      const customPayload: Record<string, string> = {};
      for (let i = 0; i < 30; i++) {
        customPayload[`key_${i}`] = "B".repeat(100);
      }

      const candidate = {
        description: bigDescription,
        custom: customPayload,
      };

      const serializedLen = new TextEncoder().encode(JSON.stringify(candidate)).length;
      if (serializedLen <= 4096) {
        expect(isOk(validateRoleMetadata(candidate))).toBe(true);
      }
    });

    it("should reject serialized payload exceeding 4096 bytes (4 KB limit)", () => {
      const hugeCustom: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        hugeCustom[`giant_key_${i}`] = "X".repeat(100);
      }

      const oversized = {
        description: "Valid description",
        custom: hugeCustom,
      };

      const serializedLen = new TextEncoder().encode(JSON.stringify(oversized)).length;
      expect(serializedLen).toBeGreaterThan(4096);

      const result = validateRoleMetadata(oversized);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/4 KB/i);
      }
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should parse metadata idempotently", () => {
      const input = {
        colorHex: "#123456",
        badgeLabel: "DevOps",
      };
      const r1 = validateRoleMetadata(input);
      const r2 = validateRoleMetadata(input);
      expect(r1).toEqual(r2);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should reject invalid color hex codes", () => {
      const invalidColors = [
        "red",
        "rgb(255,0,0)",
        "#12",
        "#12345",
        "#1234567",
        "#gggggg",
        "ff0000",
      ];

      for (const color of invalidColors) {
        const result = validateRoleMetadata({ colorHex: color });
        expect(isErr(result)).toBe(true);
      }
    });

    it("should reject invalid icon names with forbidden characters", () => {
      const invalidIcons = ["icon with spaces", "icon/path/traversal", "icon<script>", "icon$#@"];

      for (const icon of invalidIcons) {
        const result = validateRoleMetadata({ icon });
        expect(isErr(result)).toBe(true);
      }
    });

    it("should reject unrecognized extra properties (strict object)", () => {
      const extra = {
        colorHex: "#ffffff",
        unexpectedProperty: "attack",
      };

      const result = validateRoleMetadata(extra);
      expect(isErr(result)).toBe(true);
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should reject script tags or dangerous HTML injection in badgeLabel and description", () => {
      const xssInputs = [
        { badgeLabel: "<script>alert(1)</script>" },
        { description: "hello <img src=x onerror=alert(1)>" },
        { description: "javascript:void(0)" },
      ];

      for (const input of xssInputs) {
        const result = validateRoleMetadata(input);
        expect(isErr(result)).toBe(true);
      }
    });
  });
});
