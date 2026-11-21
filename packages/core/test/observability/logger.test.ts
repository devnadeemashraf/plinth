import { describe, expect, it } from "vitest";
import { createLogger, type LoggerPort } from "@/observability/logger.js";
import { redacted } from "@/redaction/redacted.js";

describe("observability / LoggerPort & structured logging (5-category TDD)", () => {
  // Capture log outputs in memory for testing
  function createTestLogger(): {
    logger: LoggerPort;
    getLogs: () => Array<Record<string, unknown>>;
  } {
    const logs: Array<Record<string, unknown>> = [];
    const logger = createLogger({
      level: "trace",
      destination: {
        write(msg: string) {
          try {
            logs.push(JSON.parse(msg.trim()));
          } catch {
            logs.push({ raw: msg });
          }
        },
      },
    });
    return { logger, getLogs: () => logs };
  }

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should emit structured JSON logs across all severity levels", () => {
      const { logger, getLogs } = createTestLogger();

      logger.trace("trace message", { step: 1 });
      logger.debug("debug message", { step: 2 });
      logger.info("info message", { step: 3 });
      logger.warn("warn message", { step: 4 });
      logger.error("error message", { step: 5 });
      logger.fatal("fatal message", { step: 6 });

      const logs = getLogs();
      expect(logs).toHaveLength(6);
      expect(logs[0]?.["msg"]).toBe("trace message");
      expect(logs[2]?.["msg"]).toBe("info message");
      expect(logs[4]?.["msg"]).toBe("error message");
    });

    it("should create child loggers with persistent contextual bindings", () => {
      const { logger, getLogs } = createTestLogger();
      const child = logger.child({ tenantId: "t_123", requestId: "req_abc" });

      child.info("processing request");

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.["msg"]).toBe("processing request");
      expect(logs[0]?.["tenantId"]).toBe("t_123");
      expect(logs[0]?.["requestId"]).toBe("req_abc");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should allow creating default logger without options", () => {
      const defaultLogger = createLogger();
      expect(defaultLogger).toBeDefined();
      expect(typeof defaultLogger.info).toBe("function");
    });

    it("should handle empty message and empty metadata gracefully", () => {
      const { logger, getLogs } = createTestLogger();
      logger.info("");
      logger.info("message only");

      const logs = getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]?.["msg"]).toBe("");
      expect(logs[1]?.["msg"]).toBe("message only");
    });

    it("should handle Error objects passed as metadata", () => {
      const { logger, getLogs } = createTestLogger();
      const err = new Error("Something broke");
      logger.error("action failed", { err });

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.["msg"]).toBe("action failed");
      const errObj = logs[0]?.["err"] as Record<string, unknown>;
      expect(errObj?.["message"]).toBe("Something broke");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should maintain independent bindings across concurrent child loggers", () => {
      const { logger, getLogs } = createTestLogger();
      const child1 = logger.child({ workerId: "w1" });
      const child2 = logger.child({ workerId: "w2" });

      child1.info("task 1 start");
      child2.info("task 2 start");
      child1.info("task 1 done");

      const logs = getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0]?.["workerId"]).toBe("w1");
      expect(logs[1]?.["workerId"]).toBe("w2");
      expect(logs[2]?.["workerId"]).toBe("w1");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should safely serialize objects with circular references without crashing", () => {
      const { logger, getLogs } = createTestLogger();
      const circular: Record<string, unknown> = { key: "value" };
      circular["loop"] = circular;

      logger.info("circular log", { data: circular });

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.["msg"]).toBe("circular log");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should automatically redact sensitive keys and Redacted<T> instances in logged payloads", () => {
      const { logger, getLogs } = createTestLogger();

      logger.info("user login attempt", {
        userId: "u_456",
        password: "raw-password-attempt",
        authorization: "Bearer secret-token-123",
        secretKey: redacted("very-secret-token"),
      });

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      const log = logs[0] as Record<string, unknown>;

      expect(log["userId"]).toBe("u_456");
      expect(log["password"]).toBe("[REDACTED]");
      expect(log["authorization"]).toBe("[REDACTED]");
      expect(log["secretKey"]).toBe("[REDACTED]");
    });
  });
});
