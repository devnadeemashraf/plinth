import { describe, expect, it } from "vitest";
import type { BadRequestError } from "@/errors/app-error.js";
import { isErr, isOk, type Result } from "@/primitives/result.js";
import {
  addBits,
  bitFromPosition,
  combineBitmasks,
  fromCanonicalHex,
  hasAllBits,
  hasAnyBit,
  hasBit,
  isSubset,
  removeBits,
  toCanonicalHex,
} from "@/rbac/bitmask.js";

describe("RBAC / Bitmask Operations & Canonical Hex (5-Category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should set and check single bits accurately", () => {
      const bit0 = bitFromPosition(0);
      const bit3 = bitFromPosition(3);
      const mask = addBits(0n, bit0);
      const maskWithBoth = addBits(mask, bit3);

      expect(hasBit(maskWithBoth, bit0)).toBe(true);
      expect(hasBit(maskWithBoth, bit3)).toBe(true);
      expect(hasBit(maskWithBoth, bitFromPosition(1))).toBe(false);
    });

    it("should perform hasAllBits and hasAnyBit checks correctly", () => {
      const b0 = bitFromPosition(0);
      const b1 = bitFromPosition(1);
      const b2 = bitFromPosition(2);
      const mask = b0 | b1;

      expect(hasAllBits(mask, b0 | b1)).toBe(true);
      expect(hasAllBits(mask, b0 | b2)).toBe(false);
      expect(hasAnyBit(mask, b2)).toBe(false);
      expect(hasAnyBit(mask, b1 | b2)).toBe(true);
    });

    it("should remove bits cleanly", () => {
      const b0 = bitFromPosition(0);
      const b1 = bitFromPosition(1);
      const mask = b0 | b1;
      const stripped = removeBits(mask, b0);

      expect(hasBit(stripped, b0)).toBe(false);
      expect(hasBit(stripped, b1)).toBe(true);
    });

    it("should serialize to canonical hex string and roundtrip through deserialization", () => {
      const mask = 0x1a2fn;
      const hex = toCanonicalHex(mask);
      expect(hex).toBe("0x1a2f");

      const parsed = fromCanonicalHex(hex);
      expect(isOk(parsed)).toBe(true);
      if (isOk(parsed)) {
        expect(parsed.value).toBe(mask);
      }
    });

    it("should combine multiple bitmasks in an iterable", () => {
      const masks = [1n, 2n, 4n, 8n];
      expect(combineBitmasks(masks)).toBe(15n);
      expect(combineBitmasks([])).toBe(0n);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle 0n correctly", () => {
      const hex = toCanonicalHex(0n);
      expect(hex).toBe("0x0");
      const parsed = fromCanonicalHex("0x0");
      expect(isOk(parsed)).toBe(true);
      if (isOk(parsed)) {
        expect(parsed.value).toBe(0n);
      }
    });

    it("should support arbitrary bit widths beyond 64 bits (e.g. 128, 256 bits)", () => {
      const bit128 = bitFromPosition(128);
      const bit256 = bitFromPosition(256);
      const wideMask = bit128 | bit256;

      expect(hasBit(wideMask, bit128)).toBe(true);
      expect(hasBit(wideMask, bit256)).toBe(true);
      expect(hasBit(wideMask, bitFromPosition(127))).toBe(false);

      const hex = toCanonicalHex(wideMask);
      expect(hex.startsWith("0x")).toBe(true);

      const parsed = fromCanonicalHex(hex);
      expect(isOk(parsed)).toBe(true);
      if (isOk(parsed)) {
        expect(parsed.value).toBe(wideMask);
        expect(hasBit(parsed.value, bit128)).toBe(true);
        expect(hasBit(parsed.value, bit256)).toBe(true);
      }
    });

    it("should parse case-insensitive hex strings", () => {
      const parsedUpper = fromCanonicalHex("0X1A2F");
      const parsedLower = fromCanonicalHex("0x1a2f");
      expect(isOk(parsedUpper)).toBe(true);
      expect(isOk(parsedLower)).toBe(true);
      if (isOk(parsedUpper) && isOk(parsedLower)) {
        expect(parsedUpper.value).toBe(parsedLower.value);
      }
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should be order-independent when combining bitmasks", () => {
      const masksA = [bitFromPosition(5), bitFromPosition(10), bitFromPosition(15)];
      const masksB = [bitFromPosition(15), bitFromPosition(5), bitFromPosition(10)];

      expect(combineBitmasks(masksA)).toBe(combineBitmasks(masksB));
    });

    it("should be idempotent when adding or removing the same bit repeatedly", () => {
      let mask = 0n;
      const b4 = bitFromPosition(4);
      mask = addBits(mask, b4);
      mask = addBits(mask, b4);
      expect(mask).toBe(b4);

      mask = removeBits(mask, b4);
      mask = removeBits(mask, b4);
      expect(mask).toBe(0n);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should throw RangeError when calling toCanonicalHex with a negative BigInt", () => {
      expect(() => toCanonicalHex(-1n)).toThrowError(/negative/i);
    });

    it("should throw RangeError when calling bitFromPosition with a negative position", () => {
      expect(() => bitFromPosition(-1)).toThrowError(/negative/i);
    });

    it("should return Err on non-string or malformed hex inputs", () => {
      const nonString = (
        fromCanonicalHex as unknown as (v: unknown) => Result<bigint, BadRequestError>
      )(123);
      expect(isErr(nonString)).toBe(true);

      const invalidStrings = [
        "",
        "   ",
        "0x",
        "123",
        "0xzz",
        "0x12g4",
        "-0x1",
        "0x-1",
        "null",
        "0x 1",
      ];

      for (const bad of invalidStrings) {
        const result = fromCanonicalHex(bad);
        expect(isErr(result)).toBe(true);
      }
    });
  });

  // Category 5: Security & Abuse Cases (Privilege Escalation & Evasion)
  describe("Category 5: Security & Abuse Cases", () => {
    it("should correctly check whether one mask is a strict subset of another", () => {
      const actorMask = bitFromPosition(0) | bitFromPosition(1) | bitFromPosition(2);
      const targetValid = bitFromPosition(1) | bitFromPosition(2);
      const targetEscalated = bitFromPosition(1) | bitFromPosition(5); // bit 5 is unheld!

      expect(isSubset(targetValid, actorMask)).toBe(true);
      expect(isSubset(targetEscalated, actorMask)).toBe(false);
    });

    it("should detect single-bit unheld permission escalation at high bit positions", () => {
      const highActor = bitFromPosition(70) | bitFromPosition(71);
      const escalated = bitFromPosition(70) | bitFromPosition(72);

      expect(isSubset(escalated, highActor)).toBe(false);
    });
  });
});
