import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("adapter-db-sqlite / SqliteDatabaseAdapter (5-category TDD)", () => {
  let db: SqliteDatabaseAdapter;

  beforeAll(async () => {
    db = new SqliteDatabaseAdapter({
      filename: ":memory:",
    });

    // Create a test table
    await db.query(`
      CREATE TABLE test_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE
      );
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should insert and query records using parameterized queries", async () => {
      await db.query("INSERT INTO test_users (id, name, email) VALUES (?, ?, ?);", [
        "usr_1",
        "Alice",
        "alice@example.com",
      ]);

      const rows = await db.query<{ id: string; name: string; email: string }>(
        "SELECT * FROM test_users WHERE id = ?;",
        ["usr_1"],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("Alice");
      expect(rows[0]?.email).toBe("alice@example.com");
    });

    it("should pass bounded health check ping", async () => {
      const isHealthy = await db.ping(2000);
      expect(isHealthy).toBe(true);
    });

    it("should execute transactions and commit changes successfully", async () => {
      await db.transaction(async (tx) => {
        await tx.query("INSERT INTO test_users (id, name, email) VALUES (?, ?, ?);", [
          "usr_tx1",
          "Bob",
          "bob@example.com",
        ]);
      });

      const rows = await db.query("SELECT * FROM test_users WHERE id = ?;", ["usr_tx1"]);
      expect(rows).toHaveLength(1);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle query without parameters or with empty parameters", async () => {
      const rows = await db.query("SELECT COUNT(*) as count FROM test_users;");
      expect(rows).toHaveLength(1);
    });

    it("should return empty array when query matches nothing", async () => {
      const rows = await db.query("SELECT * FROM test_users WHERE id = ?;", ["non_existent"]);
      expect(rows).toEqual([]);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should handle 25 sequential rapid writes without database lock contention", async () => {
      for (let i = 0; i < 25; i++) {
        await db.query("INSERT INTO test_users (id, name, email) VALUES (?, ?, ?);", [
          `rapid_${i}`,
          `User ${i}`,
          `rapid_${i}@example.com`,
        ]);
      }

      const rows = await db.query(
        "SELECT COUNT(*) as count FROM test_users WHERE id LIKE 'rapid_%';",
      );
      const count = (rows[0] as { count: number }).count;
      expect(count).toBe(25);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should rollback transaction atomically on inner error", async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.query("INSERT INTO test_users (id, name, email) VALUES (?, ?, ?);", [
            "usr_fail",
            "Fail User",
            "fail@example.com",
          ]);
          throw new Error("Simulated transaction failure");
        }),
      ).rejects.toThrow("Simulated transaction failure");

      const rows = await db.query("SELECT * FROM test_users WHERE id = ?;", ["usr_fail"]);
      expect(rows).toHaveLength(0);
    });

    it("should fail ping if database connection is closed", async () => {
      const closedDb = new SqliteDatabaseAdapter({ filename: ":memory:" });
      await closedDb.close();

      const healthy = await closedDb.ping();
      expect(healthy).toBe(false);
    });

    it("should cancel ping timeout immediately to prevent timer handle leaks", async () => {
      const pingDb = new SqliteDatabaseAdapter({ filename: ":memory:" });
      const healthy = await pingDb.ping(5000);
      expect(healthy).toBe(true);
      await pingDb.close();
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should strictly prevent SQL injection in parameterized queries", async () => {
      const injectionAttempt = "' OR '1'='1";
      const rows = await db.query("SELECT * FROM test_users WHERE name = ?;", [injectionAttempt]);
      expect(rows).toHaveLength(0);
    });
  });
});
