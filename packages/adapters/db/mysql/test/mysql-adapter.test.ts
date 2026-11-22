import { MysqlDatabaseAdapter } from "@plinth/adapter-db-mysql";
import type { Pool } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { createSimulatedMysqlPool } from "./mock-pool.js";

describe("MysqlDatabaseAdapter Unit Tests", () => {
  it("should expose underlying client and Drizzle instance", () => {
    const pool = createSimulatedMysqlPool();
    const adapter = new MysqlDatabaseAdapter({ pool });

    expect(adapter.getUnderlyingClient()).toBe(pool);
    expect(adapter.getDrizzle()).toBeDefined();
  });

  it("should initialize with connectionUri or connection parameters", () => {
    const adapterUri = new MysqlDatabaseAdapter({
      connectionUri: "mysql://root:secret@localhost:3306/testdb",
    });
    expect(adapterUri.getUnderlyingClient()).toBeDefined();

    const adapterParams = new MysqlDatabaseAdapter({
      host: "127.0.0.1",
      port: 3307,
      user: "admin",
      password: "pwd",
      database: "prod_db",
      connectionLimit: 5,
    });
    expect(adapterParams.getUnderlyingClient()).toBeDefined();
  });

  it("should allow safe double-close", async () => {
    const pool = createSimulatedMysqlPool();
    const adapter = new MysqlDatabaseAdapter({ pool });

    await adapter.close();
    await expect(adapter.close()).resolves.toBeUndefined();
  });

  it("should exercise transaction adapter methods (ping, transaction, close, query error)", async () => {
    const pool = createSimulatedMysqlPool();
    const adapter = new MysqlDatabaseAdapter({ pool });

    await adapter.transaction(async (tx) => {
      // Test tx.ping
      const alive = await tx.ping();
      expect(alive).toBe(true);

      // Test tx.transaction re-entrancy
      const nested = await tx.transaction(async (nestedTx) => {
        expect(nestedTx).toBe(tx);
        return 42;
      });
      expect(nested).toBe(42);

      // Test getUnderlyingClient
      expect(tx.getUnderlyingClient()).toBeDefined();

      // Test close and subsequent query failure
      await tx.close();
      expect(await tx.ping()).toBe(false);
      await expect(tx.query("SELECT 1;")).rejects.toThrow("MySQL transaction connection is closed");
    });

    await adapter.close();
  });

  it("should throw when query or transaction is attempted on closed adapter", async () => {
    const pool = createSimulatedMysqlPool();
    const adapter = new MysqlDatabaseAdapter({ pool });

    await adapter.close();

    await expect(adapter.query("SELECT 1;")).rejects.toThrow("MySQL database connection is closed");
    await expect(adapter.transaction(async () => {})).rejects.toThrow(
      "MySQL database connection is closed",
    );
  });

  it("should return false on ping when query rejects", async () => {
    const mockPool = {
      query: async () => {
        throw new Error("Connection failed");
      },
      getConnection: async () => {
        throw new Error("Cannot get connection");
      },
      end: async () => {},
    };

    const adapter = new MysqlDatabaseAdapter({ pool: mockPool as unknown as Pool });
    const isAlive = await adapter.ping(100);
    expect(isAlive).toBe(false);
  });
});
