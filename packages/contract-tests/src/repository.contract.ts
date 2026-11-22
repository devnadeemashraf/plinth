import type { DatabasePort } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface DatabaseContractSuiteOptions {
  readonly adapterName: string;
  readonly createAdapter: () => Promise<DatabasePort> | DatabasePort;
}

export function runDatabaseContractTests(suiteOptions: DatabaseContractSuiteOptions): void {
  const { adapterName, createAdapter } = suiteOptions;

  describe(`${adapterName} - Database Adapter Contract Tests`, { timeout: 15000 }, () => {
    describe("1. Query Execution & Parameter Binding", () => {
      it("should execute DDL, INSERT, SELECT, UPDATE, DELETE queries with parameters", async () => {
        const db = await createAdapter();

        try {
          // 1. Create table
          await db.query(`
              CREATE TABLE IF NOT EXISTS contract_test_items (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                score INT NOT NULL
              );
            `);

          // Clear any leftover data
          await db.query("DELETE FROM contract_test_items;");

          // 2. Insert with parameters
          await db.query("INSERT INTO contract_test_items (id, name, score) VALUES (?, ?, ?);", [
            "item-1",
            "Alpha",
            100,
          ]);
          await db.query("INSERT INTO contract_test_items (id, name, score) VALUES (?, ?, ?);", [
            "item-2",
            "Beta",
            200,
          ]);

          // 3. Select all
          const allRows = await db.query<{ id: string; name: string; score: number }>(
            "SELECT * FROM contract_test_items ORDER BY score ASC;",
          );
          expect(allRows).toHaveLength(2);
          expect(allRows[0]?.id).toBe("item-1");
          expect(allRows[0]?.name).toBe("Alpha");
          expect(allRows[1]?.id).toBe("item-2");

          // 4. Select single with parameter
          const single = await db.query<{ id: string; name: string; score: number }>(
            "SELECT * FROM contract_test_items WHERE id = ?;",
            ["item-1"],
          );
          expect(single).toHaveLength(1);
          expect(single[0]?.name).toBe("Alpha");

          // 5. Update with parameter
          await db.query("UPDATE contract_test_items SET score = ? WHERE id = ?;", [999, "item-1"]);
          const updated = await db.query<{ score: number }>(
            "SELECT score FROM contract_test_items WHERE id = ?;",
            ["item-1"],
          );
          expect(updated[0]?.score).toBe(999);

          // 6. Delete with parameter
          await db.query("DELETE FROM contract_test_items WHERE id = ?;", ["item-2"]);
          const afterDelete = await db.query("SELECT * FROM contract_test_items WHERE id = ?;", [
            "item-2",
          ]);
          expect(afterDelete).toHaveLength(0);
        } finally {
          await db.close();
        }
      }, 15000);

      it("should return empty array when query finds no rows", async () => {
        const db = await createAdapter();
        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS contract_test_items (
              id VARCHAR(64) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              score INT NOT NULL
            );
          `);

          const result = await db.query("SELECT * FROM contract_test_items WHERE id = ?;", [
            "non-existent-id",
          ]);
          expect(Array.isArray(result)).toBe(true);
          expect(result).toHaveLength(0);
        } finally {
          await db.close();
        }
      });
    });

    describe("2. Transactions & Rollbacks", () => {
      it("should commit transaction when handler resolves successfully", async () => {
        const db = await createAdapter();

        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS contract_test_tx (
              id VARCHAR(64) PRIMARY KEY,
              val VARCHAR(255) NOT NULL
            );
          `);
          await db.query("DELETE FROM contract_test_tx;");

          await db.transaction(async (tx) => {
            await tx.query("INSERT INTO contract_test_tx (id, val) VALUES (?, ?);", [
              "tx-1",
              "Committed",
            ]);
            await tx.query("INSERT INTO contract_test_tx (id, val) VALUES (?, ?);", [
              "tx-2",
              "Also Committed",
            ]);
          });

          const rows = await db.query<{ id: string; val: string }>(
            "SELECT * FROM contract_test_tx ORDER BY id ASC;",
          );
          expect(rows).toHaveLength(2);
          expect(rows[0]?.val).toBe("Committed");
          expect(rows[1]?.val).toBe("Also Committed");
        } finally {
          await db.close();
        }
      });

      it("should rollback transaction completely when handler throws an error", async () => {
        const db = await createAdapter();

        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS contract_test_tx (
              id VARCHAR(64) PRIMARY KEY,
              val VARCHAR(255) NOT NULL
            );
          `);
          await db.query("DELETE FROM contract_test_tx;");

          let errorCaught = false;
          try {
            await db.transaction(async (tx) => {
              await tx.query("INSERT INTO contract_test_tx (id, val) VALUES (?, ?);", [
                "tx-fail-1",
                "Should Rollback",
              ]);
              throw new Error("Simulated transaction fault!");
            });
          } catch (err) {
            errorCaught = true;
            expect((err as Error).message).toBe("Simulated transaction fault!");
          }

          expect(errorCaught).toBe(true);

          // Verify row was rolled back and does not exist
          const rows = await db.query("SELECT * FROM contract_test_tx WHERE id = ?;", [
            "tx-fail-1",
          ]);
          expect(rows).toHaveLength(0);
        } finally {
          await db.close();
        }
      });
    });

    describe("3. Health Check & Connectivity (Ping)", () => {
      it("should return true on ping when connection is healthy", async () => {
        const db = await createAdapter();
        try {
          const isAlive = await db.ping(2000);
          expect(isAlive).toBe(true);
        } finally {
          await db.close();
        }
      });

      it("should return false on ping after database is closed", async () => {
        const db = await createAdapter();
        await db.close();
        const isAlive = await db.ping(1000);
        expect(isAlive).toBe(false);
      });
    });

    describe("4. Lifecycle & Underlying Client", () => {
      it("should provide access to underlying client/pool instance", async () => {
        const db = await createAdapter();
        try {
          const client = db.getUnderlyingClient();
          expect(client).toBeDefined();
        } finally {
          await db.close();
        }
      });

      it("should fail queries after database connection is closed", async () => {
        const db = await createAdapter();
        await db.close();

        await expect(db.query("SELECT 1;")).rejects.toThrow();
      });
    });
  });
}
