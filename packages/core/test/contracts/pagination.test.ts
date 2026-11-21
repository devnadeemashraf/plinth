import { describe, expect, it } from "vitest";
import { cursorPaginationQuerySchema, paginateArray } from "@/contracts/pagination.js";

describe("contracts / cursor pagination (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should parse default pagination parameters (limit: 20)", () => {
      const parsed = cursorPaginationQuerySchema.parse({});
      expect(parsed.limit).toBe(20);
      expect(parsed.cursor).toBeUndefined();
    });

    it("should accept valid custom limit and cursor", () => {
      const parsed = cursorPaginationQuerySchema.parse({
        limit: "50",
        cursor: "018f6f5c8b8970008000abcdef123456",
      });
      expect(parsed.limit).toBe(50);
      expect(parsed.cursor).toBe("018f6f5c8b8970008000abcdef123456");
    });

    it("should correctly slice items and calculate nextCursor via paginateArray", () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: `item_${i}`, name: `Item ${i}` }));
      const page1 = paginateArray(items, { limit: 10 });

      expect(page1.items).toHaveLength(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBe("item_9");

      const pageLast = paginateArray(items.slice(40), { limit: 10 });
      expect(pageLast.items).toHaveLength(10);
      expect(pageLast.hasMore).toBe(false);
      expect(pageLast.nextCursor).toBeNull();
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should accept minimum limit of 1 and maximum limit of 100", () => {
      expect(cursorPaginationQuerySchema.parse({ limit: 1 }).limit).toBe(1);
      expect(cursorPaginationQuerySchema.parse({ limit: 100 }).limit).toBe(100);
    });

    it("should reject limit < 1", () => {
      expect(() => cursorPaginationQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => cursorPaginationQuerySchema.parse({ limit: -5 })).toThrow();
    });

    it("should handle empty array in paginateArray gracefully", () => {
      const result = paginateArray([], { limit: 20 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce deterministic slices across repeated paginateArray calls", () => {
      const items = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const res1 = paginateArray(items, { limit: 2 });
      const res2 = paginateArray(items, { limit: 2 });

      expect(res1).toEqual(res2);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should handle cursor not found in list by starting from beginning", () => {
      const items = [{ id: "10" }, { id: "20" }, { id: "30" }];
      const result = paginateArray(items, { cursor: "non_existent_cursor", limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("10");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should STRICTLY reject limit > 100 to prevent unbounded memory exhaustion", () => {
      expect(() => cursorPaginationQuerySchema.parse({ limit: 101 })).toThrow();
      expect(() => cursorPaginationQuerySchema.parse({ limit: 999999 })).toThrow();
    });
  });
});
