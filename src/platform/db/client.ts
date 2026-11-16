import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Config } from "#platform/config/schema.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";

export interface Database {
  readonly db: NodePgDatabase;
  readonly pool: Pool;
  /** Ends every pooled connection. */
  close(): Promise<void>;
}

/** The process's Postgres pool and its Drizzle handle. Connects lazily, on the first query. */
export function createDatabase(
  config: Pick<Config, "DATABASE_URL" | "DATABASE_POOL_MAX">,
  logger: Logger,
): Database {
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_MAX });
  // An idle connection that drops (server restart, network) is reported here; without a listener
  // the pool's "error" event would crash the process. The pool replaces the connection on demand.
  pool.on("error", (error) => {
    logger.warn({ err: error }, "idle postgres connection failed");
  });
  return { db: drizzle({ client: pool }), pool, close: () => pool.end() };
}
