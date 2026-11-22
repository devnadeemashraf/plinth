import type { DatabasePort } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface TenancyRlsContractSuiteOptions {
  readonly adapterName: string;
  readonly createAdapter: () => Promise<DatabasePort> | DatabasePort;
}

export function runTenancyRlsContractTests(suiteOptions: TenancyRlsContractSuiteOptions): void {
  const { adapterName, createAdapter } = suiteOptions;

  describe(`${adapterName} - PostgreSQL Row-Level Security (RLS) Isolation Contract`, () => {
    it("should strictly enforce zero cross-tenant row leakage even on broken queries without WHERE clauses", async () => {
      const db = await createAdapter();

      try {
        // 1. Setup multi-tenant table
        await db.query(`
          CREATE TABLE IF NOT EXISTS test_rls_documents (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL
          );
        `);

        // 2. Enable and FORCE RLS
        await db.query("ALTER TABLE test_rls_documents ENABLE ROW LEVEL SECURITY;");
        await db.query("ALTER TABLE test_rls_documents FORCE ROW LEVEL SECURITY;");

        // 3. Create unprivileged application role (superusers bypass RLS by design in Postgres)
        await db.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'test_rls_app_user') THEN
              CREATE ROLE test_rls_app_user;
            END IF;
          END
          $$;
        `);
        await db.query("GRANT ALL ON test_rls_documents TO test_rls_app_user;");

        // 4. Create Tenant Isolation Policy
        await db.query("DROP POLICY IF EXISTS tenant_rls_policy ON test_rls_documents;");
        await db.query(`
          CREATE POLICY tenant_rls_policy ON test_rls_documents
            FOR ALL
            TO test_rls_app_user
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''))
            WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''));
        `);

        // 5. Seed documents for tenant-alpha and tenant-beta in their respective transactions
        await db.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE test_rls_app_user;");
          await tx.query("SET LOCAL app.current_tenant_id = 'tenant-alpha';");
          await tx.query(
            "INSERT INTO test_rls_documents (id, tenant_id, title, content) VALUES (?, ?, ?, ?);",
            ["doc-alpha-1", "tenant-alpha", "Alpha Blueprint", "Classified Alpha Plan"],
          );
        });

        await db.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE test_rls_app_user;");
          await tx.query("SET LOCAL app.current_tenant_id = 'tenant-beta';");
          await tx.query(
            "INSERT INTO test_rls_documents (id, tenant_id, title, content) VALUES (?, ?, ?, ?);",
            ["doc-beta-1", "tenant-beta", "Beta Financials", "Classified Beta Balance"],
          );
        });

        // 6. Test Tenant Alpha Context Isolation
        await db.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE test_rls_app_user;");
          await tx.query("SET LOCAL app.current_tenant_id = 'tenant-alpha';");

          // Naive broken query WITHOUT any WHERE clause
          const rows = await tx.query<{ id: string; tenant_id: string; title: string }>(
            "SELECT * FROM test_rls_documents;",
          );

          expect(rows).toHaveLength(1);
          expect(rows[0]?.id).toBe("doc-alpha-1");
          expect(rows[0]?.tenant_id).toBe("tenant-alpha");

          // Explicit cross-tenant query attempting to read tenant-beta's record
          const crossTenantRows = await tx.query(
            "SELECT * FROM test_rls_documents WHERE tenant_id = 'tenant-beta';",
          );
          expect(crossTenantRows).toHaveLength(0);

          // Update without WHERE clause modifies ONLY tenant-alpha's row
          await tx.query("UPDATE test_rls_documents SET title = 'Alpha Renamed';");
        });

        // 7. Test Tenant Beta Context Isolation
        await db.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE test_rls_app_user;");
          await tx.query("SET LOCAL app.current_tenant_id = 'tenant-beta';");

          const rows = await tx.query<{ id: string; tenant_id: string; title: string }>(
            "SELECT * FROM test_rls_documents;",
          );

          expect(rows).toHaveLength(1);
          expect(rows[0]?.id).toBe("doc-beta-1");
          expect(rows[0]?.title).toBe("Beta Financials"); // Unmodified by alpha's update!

          // Attempting to insert a row belonging to tenant-alpha from tenant-beta context
          await expect(
            tx.query(
              "INSERT INTO test_rls_documents (id, tenant_id, title, content) VALUES (?, ?, ?, ?);",
              ["exploit-1", "tenant-alpha", "Malicious Injection", "Attack"],
            ),
          ).rejects.toThrow();
        });

        // 8. Test Empty / Unset Tenant Context Isolation
        await db.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE test_rls_app_user;");
          // Without setting app.current_tenant_id
          const rows = await tx.query("SELECT * FROM test_rls_documents;");
          expect(rows).toHaveLength(0);
        });
      } finally {
        await db.close();
      }
    }, 30000);
  });
}
