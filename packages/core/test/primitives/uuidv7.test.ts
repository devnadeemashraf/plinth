import { describe, expect, it, vi } from "vitest";
import { extractUuidV7Timestamp, generateUuidV7, isUuidV7 } from "@/primitives/uuidv7.js";

describe("primitives / uuidv7 RFC 9562 (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should generate a valid RFC 9562 UUIDv7 string", () => {
      const before = Date.now();
      const uuid = generateUuidV7();
      const after = Date.now();

      expect(typeof uuid).toBe("string");
      expect(uuid).toHaveLength(36);
      expect(isUuidV7(uuid)).toBe(true);

      // Verify version 7 in bits 48..51 (char at index 14 is '7')
      expect(uuid.charAt(14)).toBe("7");

      // Verify variant in bits 64..65 (char at index 19 is '8', '9', 'a', or 'b')
      expect(["8", "9", "a", "b"]).toContain(uuid.charAt(19));

      // Verify timestamp extraction matches current time
      const extractedTime = extractUuidV7Timestamp(uuid).getTime();
      expect(extractedTime).toBeGreaterThanOrEqual(before);
      expect(extractedTime).toBeLessThanOrEqual(after);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject nil, v4, malformed, and non-string values with isUuidV7", () => {
      expect(isUuidV7("00000000-0000-0000-0000-000000000000")).toBe(false);
      // v4 UUID (version 4)
      expect(isUuidV7("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(false);
      // invalid variant (e.g. 'c' instead of 8,9,a,b)
      expect(isUuidV7("018f6f5c-8b89-7123-c456-426614174000")).toBe(false);
      // uppercase hex (RFC 9562 canonical form is lowercase)
      expect(isUuidV7("018F6F5C-8B89-7123-8456-426614174000")).toBe(false);
      // wrong lengths
      expect(isUuidV7("018f6f5c-8b89-7123-8456-42661417400")).toBe(false);
      expect(isUuidV7("018f6f5c-8b89-7123-8456-4266141740000")).toBe(false);
      // empty string and whitespace
      expect(isUuidV7("")).toBe(false);
      expect(isUuidV7("   ")).toBe(false);
      // non-string types
      expect(isUuidV7(null)).toBe(false);
      expect(isUuidV7(undefined)).toBe(false);
      expect(isUuidV7(12345)).toBe(false);
      expect(isUuidV7({})).toBe(false);
      expect(isUuidV7([])).toBe(false);
    });

    it("should throw a descriptive error when extracting timestamp from non-v7 UUID", () => {
      expect(() => extractUuidV7Timestamp("not-a-uuid")).toThrow(/Invalid RFC 9562 UUIDv7/);
      expect(() => extractUuidV7Timestamp("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toThrow(
        /Invalid RFC 9562 UUIDv7/,
      );
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should generate strictly monotonically increasing UUIDs within the same millisecond", () => {
      const count = 1000;
      const uuids: string[] = new Array(count);

      for (let i = 0; i < count; i++) {
        uuids[i] = generateUuidV7();
      }

      // Check strictly increasing: uuid[i] < uuid[i+1]
      for (let i = 0; i < count - 1; i++) {
        const a = uuids[i];
        const b = uuids[i + 1];
        if (a === undefined || b === undefined) {
          throw new Error("Unexpected undefined UUID");
        }
        expect(a < b).toBe(true);
      }
    });

    it("should maintain strict monotonicity when system clock regresses (NTP backward drift)", () => {
      let mockedTime = 1_700_000_000_000; // fixed starting timestamp

      vi.spyOn(Date, "now").mockImplementation(() => mockedTime);

      try {
        const id1 = generateUuidV7();

        // Simulate backward clock step (e.g., NTP adjustment back 500ms)
        mockedTime -= 500;
        const id2 = generateUuidV7();

        // Simulate another backward step
        mockedTime -= 1000;
        const id3 = generateUuidV7();

        // Even with clock regression, id1 < id2 < id3
        expect(id1 < id2).toBe(true);
        expect(id2 < id3).toBe(true);

        // Timestamps must not regress
        const t1 = extractUuidV7Timestamp(id1).getTime();
        const t2 = extractUuidV7Timestamp(id2).getTime();
        const t3 = extractUuidV7Timestamp(id3).getTime();

        expect(t2).toBeGreaterThanOrEqual(t1);
        expect(t3).toBeGreaterThanOrEqual(t2);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should safely handle sequence counter overflow within the same ms by advancing logical timestamp", () => {
      const mockedTime = 1_700_000_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => mockedTime);

      try {
        // Generate more than 4096 (12-bit max counter) UUIDs in same mocked ms
        const overflowBatch = 4100;
        let lastId = generateUuidV7();

        for (let i = 1; i < overflowBatch; i++) {
          const nextId = generateUuidV7();
          expect(lastId < nextId).toBe(true);
          lastId = nextId;
        }
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should possess sufficient random entropy across generated UUIDs", () => {
      const generated = new Set<string>();
      const count = 500;

      for (let i = 0; i < count; i++) {
        generated.add(generateUuidV7());
      }

      // No collisions
      expect(generated.size).toBe(count);

      // Verify random trailing portions differ (last 12 hex chars)
      const randomSuffixes = new Set<string>();
      for (const uuid of generated) {
        randomSuffixes.add(uuid.slice(24));
      }
      expect(randomSuffixes.size).toBe(count);
    });
  });
});
