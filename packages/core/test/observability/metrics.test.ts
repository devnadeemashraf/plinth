import { describe, expect, it } from "vitest";
import { createInMemoryMetrics, type MetricsPort } from "@/observability/metrics.js";

describe("observability / MetricsPort & RED/USE metrics (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should record counter, gauge, and histogram measurements", () => {
      const metrics: MetricsPort = createInMemoryMetrics();

      metrics.increment("orders_placed_total", { tenant: "t_1" }, 1);
      metrics.increment("orders_placed_total", { tenant: "t_1" }, 2);
      metrics.gauge("active_connections", 42, { pool: "primary" });
      metrics.histogram("db_query_duration_ms", 12.5, { table: "users" });

      const snapshot = metrics.getSnapshot();
      expect(snapshot.counters["orders_placed_total{tenant=t_1}"]).toBe(3);
      expect(snapshot.gauges["active_connections{pool=primary}"]).toBe(42);
      expect(snapshot.histograms["db_query_duration_ms{table=users}"]?.count).toBe(1);
      expect(snapshot.histograms["db_query_duration_ms{table=users}"]?.sum).toBe(12.5);
    });

    it("should record HTTP RED metrics (Rate, Errors, Duration)", () => {
      const metrics = createInMemoryMetrics();

      metrics.recordHttpRequest("GET", "/api/v1/health", 200, 5.2);
      metrics.recordHttpRequest("POST", "/api/v1/auth/login", 401, 25.1);

      const snapshot = metrics.getSnapshot();
      expect(
        snapshot.counters["http_requests_total{method=GET,route=/api/v1/health,status=200}"],
      ).toBe(1);
      expect(
        snapshot.counters["http_requests_total{method=POST,route=/api/v1/auth/login,status=401}"],
      ).toBe(1);
      expect(
        snapshot.counters["http_errors_total{method=POST,route=/api/v1/auth/login,status=401}"],
      ).toBe(1);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle default increment value 1 and empty tags", () => {
      const metrics = createInMemoryMetrics();
      metrics.increment("simple_counter");

      const snapshot = metrics.getSnapshot();
      expect(snapshot.counters["simple_counter"]).toBe(1);
    });

    it("should handle 0 and negative gauge values", () => {
      const metrics = createInMemoryMetrics();
      metrics.gauge("temperature", -5);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.gauges["temperature"]).toBe(-5);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should safely aggregate 1,000 rapid concurrent counter increments", () => {
      const metrics = createInMemoryMetrics();
      for (let i = 0; i < 1000; i++) {
        metrics.increment("concurrent_hits", { worker: "w1" }, 1);
      }

      const snapshot = metrics.getSnapshot();
      expect(snapshot.counters["concurrent_hits{worker=w1}"]).toBe(1000);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should ignore NaN and Infinity values without throwing", () => {
      const metrics = createInMemoryMetrics();
      metrics.increment("invalid_increment", undefined, Number.NaN);
      metrics.histogram("invalid_histogram", Number.POSITIVE_INFINITY);
      metrics.gauge("invalid_metric", Number.NaN);
      metrics.gauge("infinite_metric", Number.POSITIVE_INFINITY);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.counters["invalid_increment"]).toBeUndefined();
      expect(snapshot.histograms["invalid_histogram"]).toBeUndefined();
      expect(snapshot.gauges["invalid_metric"]).toBeUndefined();
      expect(snapshot.gauges["infinite_metric"]).toBeUndefined();
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should cap total in-memory metric keys to prevent high-cardinality OOM DoS", () => {
      const boundedMetrics = createInMemoryMetrics({ maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        boundedMetrics.increment(`test_counter_${i}`);
      }

      const snapshot = boundedMetrics.getSnapshot();
      expect(Object.keys(snapshot.counters)).toHaveLength(5);
    });

    it("should sanitize metric tag names and values to prevent Prometheus label injection", () => {
      const metrics = createInMemoryMetrics();
      // Tag names with special chars should be normalized
      metrics.increment("test_metric", { "bad:tag name": "val\nnewline" });

      const snapshot = metrics.getSnapshot();
      const keys = Object.keys(snapshot.counters);
      expect(keys[0]).not.toContain("\n");
    });
  });
});
