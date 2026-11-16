import { describe, expect, it } from "vitest";
import { systemClock } from "../ports/clock.ts";
import { uuidV7Generator } from "../ports/id-generator.ts";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidV7Generator", () => {
  it("[P0-01 #10] 10 000 `uuidV7Generator.next()` values (property) → all unique, each matches the UUIDv7 regex", () => {
    const ids = Array.from({ length: 10_000 }, () => uuidV7Generator.next());
    expect(new Set(ids).size).toBe(10_000);
    for (const id of ids) {
      expect(id).toMatch(UUID_V7);
    }
  });
});

describe("systemClock", () => {
  it("returns the current time", () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
