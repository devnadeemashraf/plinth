import { normalizeSqlPlaceholders, PostgresDatabaseAdapter } from "@plinth/adapter-db-postgres";
import { createTenantId, runWithTenantContext } from "@plinth/core";
import type pg from "pg";
import { describe, expect, it } from "vitest";

describe("PostgresDatabaseAdapter Unit Tests", () => {
  describe("normalizeSqlPlaceholders", () => {
    it("should translate '?' to '$1, $2, $3'", () => {
      const sql = "SELECT * FROM users WHERE id = ? AND email = ? AND age > ?;";
      const normalized = normalizeSqlPlaceholders(sql);
      expect(normalized).toBe("SELECT * FROM users WHERE id = $1 AND email = $2 AND age > $3;");
    });

    it("should preserve '?' inside single quotes and double quotes", () => {
      const sql = "SELECT 'Is this ?' as question, \"col?\" as col FROM t WHERE id = ?;";
      const normalized = normalizeSqlPlaceholders(sql);
      expect(normalized).toBe(
        "SELECT 'Is this ?' as question, \"col?\" as col FROM t WHERE id = $1;",
      );
    });

    it("should preserve existing '$1, $2' parameters", () => {
      const sql = "SELECT * FROM users WHERE id = $1 AND role = $2;";
      const normalized = normalizeSqlPlaceholders(sql);
      expect(normalized).toBe(sql);
    });

    it("should increment '?' from highest existing '$N' to prevent parameter collision", () => {
      const sql = "SELECT * FROM users WHERE id = $1 AND email = ? AND org_id = $3 AND status = ?;";
      const normalized = normalizeSqlPlaceholders(sql);
      expect(normalized).toBe(
        "SELECT * FROM users WHERE id = $1 AND email = $4 AND org_id = $3 AND status = $5;",
      );
    });
  });

  describe("Adapter instantiation and client access", () => {
    it("should expose underlying client and Drizzle instance", () => {
      const adapter = new PostgresDatabaseAdapter({
        connectionString: "postgresql://localhost:5432/mock",
      });
      expect(adapter.getUnderlyingClient()).toBeDefined();
      expect(adapter.getDrizzle()).toBeDefined();
    });

    it("should allow safe double-close", async () => {
      const adapter = new PostgresDatabaseAdapter({
        connectionString: "postgresql://localhost:5432/mock",
      });
      await adapter.close();
      await expect(adapter.close()).resolves.toBeUndefined();
    });

    it("should support non-pool direct client transactions and transaction adapter methods", async () => {
      const queriesExecuted: string[] = [];
      const mockClient = {
        query: async (sql: string) => {
          queriesExecuted.push(sql);
          return { rows: [{ alive: 1 }] };
        },
        end: async () => {},
      };

      const adapter = new PostgresDatabaseAdapter({
        client: mockClient as unknown as pg.Client,
      });

      const res = await adapter.transaction(async (tx) => {
        expect(await tx.ping()).toBe(true);
        expect(tx.getUnderlyingClient()).toBe(mockClient);
        const rows = await tx.query("SELECT 1;");
        expect(rows).toEqual([{ alive: 1 }]);

        // Nested transaction call
        const nested = await tx.transaction(async (inner) => {
          expect(inner).toBe(tx);
          return "ok";
        });
        expect(nested).toBe("ok");

        await tx.close();
        expect(await tx.ping()).toBe(false);
        await expect(tx.query("SELECT 1;")).rejects.toThrow(
          "PostgreSQL transaction client is closed",
        );
        return 999;
      });

      expect(res).toBe(999);
      expect(queriesExecuted).toContain("BEGIN;");
      expect(queriesExecuted).toContain("COMMIT;");
    });

    it("should automatically set transaction-local RLS tenant context when configured", async () => {
      const queriesExecuted: Array<{ sql: string; params: unknown[] }> = [];
      const mockClient = {
        query: async (sql: string, params?: unknown[]) => {
          queriesExecuted.push({ sql, params: params ?? [] });
          return { rows: [] };
        },
        end: async () => {},
      };

      const adapter = new PostgresDatabaseAdapter({
        client: mockClient as unknown as pg.Client,
        rlsTenantVariable: "app.current_tenant_id",
      });

      const tenantCtx = {
        tenantId: createTenantId("tenant_acme_corp"),
        slug: "acme",
        mode: "multi" as const,
        isDefault: false,
      };

      await runWithTenantContext(tenantCtx, async () => {
        await adapter.transaction(async (tx) => {
          await tx.query("SELECT * FROM documents;");
        });
      });

      const setConfigCall = queriesExecuted.find(
        (q) => q.sql === "SELECT set_config($1, $2, true);",
      );
      expect(setConfigCall).toBeDefined();
      expect(setConfigCall?.params).toEqual(["app.current_tenant_id", "tenant_acme_corp"]);
    });

    it("should rollback non-pool direct client transaction when handler throws", async () => {
      const queriesExecuted: string[] = [];
      const mockClient = {
        query: async (sql: string) => {
          queriesExecuted.push(sql);
          return { rows: [] };
        },
        end: async () => {},
      };

      const adapter = new PostgresDatabaseAdapter({
        client: mockClient as unknown as pg.Client,
      });

      await expect(
        adapter.transaction(async () => {
          throw new Error("Direct client tx fault");
        }),
      ).rejects.toThrow("Direct client tx fault");

      expect(queriesExecuted).toContain("BEGIN;");
      expect(queriesExecuted).toContain("ROLLBACK;");
    });

    it("should throw when query or transaction is attempted on closed adapter", async () => {
      const adapter = new PostgresDatabaseAdapter({
        connectionString: "postgresql://localhost:5432/mock",
      });
      await adapter.close();

      await expect(adapter.query("SELECT 1;")).rejects.toThrow(
        "PostgreSQL database connection is closed",
      );
      await expect(adapter.transaction(async () => {})).rejects.toThrow(
        "PostgreSQL database connection is closed",
      );
    });

    it("should return false on ping when query rejects", async () => {
      const mockClient = {
        query: async () => {
          throw new Error("DB unreachable");
        },
        end: async () => {},
      };

      const adapter = new PostgresDatabaseAdapter({ client: mockClient as unknown as pg.Client });
      const isAlive = await adapter.ping(100);
      expect(isAlive).toBe(false);
    });
  });
});
