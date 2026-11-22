# Adapter Swap Handbook: SQLite vs PostgreSQL vs MySQL

This 1-page guide explains how to swap between database adapters: `@plinth/adapter-db-sqlite`, `@plinth/adapter-db-postgres`, and `@plinth/adapter-db-mysql`.

---

## 1. Architectural Comparison

| Dimension | SQLite (`better-sqlite3`) | PostgreSQL (`pg` + RLS) | MySQL (`mysql2/promise`) |
|---|---|---|---|
| **Use Case** | Local dev, tests, $0 side projects | Multi-tenant SaaS, enterprise RLS | High-throughput web systems |
| **Tenancy Isolation** | Logical `tenant_id` filtering | Defense-in-depth: `tenant_id` + Row-Level Security (`SET LOCAL`) | Logical `tenant_id` filtering |
| **Concurrency** | WAL mode, single writer | Full MVCC, multi-connection pool | Transactional MVCC pool |
| **Placeholder Syntax** | `?` | `$1, $2` (Auto-normalized by adapter) | `?` |

---

## 2. PostgreSQL Row-Level Security (RLS) Verification
When using `@plinth/adapter-db-postgres`, RLS ensures that even if a developer omits a `WHERE tenant_id = ?` clause in raw SQL, zero cross-tenant records can ever leak.

### How it works:
1. Every query executed in a tenant context runs inside a transaction block.
2. The adapter issues `SELECT set_config('app.current_tenant_id', $1, true)`.
3. PostgreSQL applies the RLS policy:
   ```sql
   CREATE POLICY tenant_isolation_policy ON <table_name>
     USING (tenant_id = current_setting('app.current_tenant_id', true));
   ```
4. Upon transaction commit or rollback, the setting is automatically cleared.

---

## 3. Swap Steps

### To Switch to PostgreSQL:
```bash
pnpm add @plinth/adapter-db-postgres
```
In `src/server.ts`:
```typescript
import { PostgresDatabaseAdapter } from "@plinth/adapter-db-postgres";

const db = new PostgresDatabaseAdapter({
  connectionString: process.env.DATABASE_URL!,
  maxConnections: 20,
  rlsTenantVariable: "app.current_tenant_id",
});
await db.connect();
```

### Verification:
```bash
pnpm test:db
pnpm test:contracts
```
All database adapters pass 100% of the shared `DatabasePort` contract tests.
