import { describe, expect, it } from "vitest";
import { calculateNextRetryTime } from "@/ports/queue.js";

describe("Queue Helpers - calculateNextRetryTime", () => {
  it("should calculate initial retry at baseBackoffSeconds for retryCount = 1", () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z");
    const next = calculateNextRetryTime(2, 1, baseDate);
    // 2 * 2^0 = 2 seconds
    expect(next.toISOString()).toBe("2026-01-01T00:00:02.000Z");
  });

  it("should exponentially increase backoff for retryCount = 2, 3, 4", () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z");
    // retry 2: 2 * 2^1 = 4 seconds
    expect(calculateNextRetryTime(2, 2, baseDate).toISOString()).toBe("2026-01-01T00:00:04.000Z");
    // retry 3: 2 * 2^2 = 8 seconds
    expect(calculateNextRetryTime(2, 3, baseDate).toISOString()).toBe("2026-01-01T00:00:08.000Z");
    // retry 4: 2 * 2^3 = 16 seconds
    expect(calculateNextRetryTime(2, 4, baseDate).toISOString()).toBe("2026-01-01T00:00:16.000Z");
  });

  it("should handle 0 or negative retry count safely", () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z");
    expect(calculateNextRetryTime(5, 0, baseDate).toISOString()).toBe("2026-01-01T00:00:05.000Z");
  });
});
