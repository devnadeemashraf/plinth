/**
 * The `migrate` process: `node src/main/migrate.ts [migrationsFolder]` (default `drizzle`).
 * Applies pending migrations in one transaction while holding an advisory lock, so concurrent
 * deploys apply each migration once. Exits 0 on success and 1 on failure.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DrizzleQueryError } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { loadConfig } from "#platform/config/load.ts";
import { createLogger } from "#platform/logger/create-logger.ts";

const MIGRATION_LOCK = 727274;
const migrationsFolder = process.argv[2] ?? "drizzle";

const config = loadConfig();
const logger = createLogger(config);

async function appliedCount(client: Client): Promise<number> {
  const table = await client.query<{ name: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as name",
  );
  if (table.rows[0]?.name == null) {
    return 0;
  }
  const result = await client.query<{ count: number }>(
    "select count(*)::int as count from drizzle.__drizzle_migrations",
  );
  return result.rows[0]?.count ?? 0;
}

/** The tag of the migration holding the statement that failed, when the error names a statement. */
function failingMigration(error: unknown): string | undefined {
  if (!(error instanceof DrizzleQueryError)) {
    return undefined;
  }
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const index = readMigrationFiles({ migrationsFolder }).findIndex((migration) =>
    migration.sql.includes(error.query),
  );
  return journal.entries[index]?.tag;
}

const client = new Client({ connectionString: config.DATABASE_URL });
let exitCode = 0;
try {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
  try {
    const before = await appliedCount(client);
    await migrate(drizzle({ client }), { migrationsFolder });
    logger.info({ applied: (await appliedCount(client)) - before }, "migrations applied");
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]);
  }
} catch (error) {
  exitCode = 1;
  logger.error({ err: error, migration: failingMigration(error) }, "migration failed");
} finally {
  await client.end();
}
process.exit(exitCode);
