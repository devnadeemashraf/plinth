import { type DatabasePort, getTenantContext } from "@plinth/core";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { normalizeSqlPlaceholders } from "./placeholders.js";

export interface PostgresDatabaseOptions {
  readonly connectionString?: string | undefined;
  readonly pool?: pg.Pool | undefined;
  readonly client?: pg.Client | pg.Pool | undefined;
  readonly maxConnections?: number | undefined;
  readonly idleTimeoutMillis?: number | undefined;
  readonly connectionTimeoutMillis?: number | undefined;
  readonly rlsTenantVariable?: string | undefined;
}

class PostgresTransactionAdapter implements DatabasePort {
  readonly #client: pg.PoolClient | pg.Client;
  #closed = false;

  constructor(client: pg.PoolClient | pg.Client) {
    this.#client = client;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.#closed) {
      throw new Error("PostgreSQL transaction client is closed");
    }
    const normalized = normalizeSqlPlaceholders(sql);
    const res = await this.#client.query(normalized, params ?? []);
    return (res.rows ?? []) as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    if (this.#closed) {
      return false;
    }
    try {
      const res = await this.#client.query("SELECT 1 as alive;");
      return (res.rows[0] as { alive: number } | undefined)?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
  }

  getUnderlyingClient(): pg.PoolClient | pg.Client {
    return this.#client;
  }
}

export class PostgresDatabaseAdapter implements DatabasePort {
  readonly #pool: pg.Pool | pg.Client;
  readonly #drizzle: NodePgDatabase;
  readonly #isPool: boolean;
  readonly #rlsTenantVariable?: string | undefined;
  #closed = false;

  constructor(options?: PostgresDatabaseOptions) {
    this.#rlsTenantVariable = options?.rlsTenantVariable;

    if (options?.pool) {
      this.#pool = options.pool;
      this.#isPool = true;
    } else if (options?.client) {
      this.#pool = options.client;
      this.#isPool =
        "connect" in options.client &&
        typeof options.client.connect === "function" &&
        "end" in options.client;
    } else {
      this.#pool = new pg.Pool({
        connectionString: options?.connectionString,
        max: options?.maxConnections ?? 20,
        idleTimeoutMillis: options?.idleTimeoutMillis ?? 30000,
        connectionTimeoutMillis: options?.connectionTimeoutMillis ?? 2000,
      });
      this.#isPool = true;
    }

    this.#drizzle = drizzle(this.#pool as pg.Pool);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.#closed) {
      throw new Error("PostgreSQL database connection is closed");
    }

    const normalized = normalizeSqlPlaceholders(sql);
    const res = await this.#pool.query(normalized, params ?? []);
    return (res.rows ?? []) as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    if (this.#closed) {
      throw new Error("PostgreSQL database connection is closed");
    }

    if (this.#isPool && "connect" in this.#pool && typeof this.#pool.connect === "function") {
      const client = await (this.#pool as pg.Pool).connect();
      const txAdapter = new PostgresTransactionAdapter(client);

      await client.query("BEGIN;");
      if (this.#rlsTenantVariable) {
        const tenantCtx = getTenantContext();
        if (tenantCtx) {
          await client.query("SELECT set_config($1, $2, true);", [
            this.#rlsTenantVariable,
            tenantCtx.tenantId,
          ]);
        }
      }
      try {
        const result = await fn(txAdapter);
        await client.query("COMMIT;");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK;");
        } catch {
          // Ignore rollback failure if transaction already aborted
        }
        throw err;
      } finally {
        client.release();
      }
    }

    // Direct single client transaction
    await this.#pool.query("BEGIN;");
    if (this.#rlsTenantVariable) {
      const tenantCtx = getTenantContext();
      if (tenantCtx) {
        await this.#pool.query("SELECT set_config($1, $2, true);", [
          this.#rlsTenantVariable,
          tenantCtx.tenantId,
        ]);
      }
    }
    const txAdapter = new PostgresTransactionAdapter(this.#pool as pg.Client);
    try {
      const result = await fn(txAdapter);
      await this.#pool.query("COMMIT;");
      return result;
    } catch (err) {
      try {
        await this.#pool.query("ROLLBACK;");
      } catch {
        // Ignore rollback failure
      }
      throw err;
    }
  }

  async ping(timeoutMs = 2000): Promise<boolean> {
    if (this.#closed) {
      return false;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const pingPromise = this.#pool.query("SELECT 1 as alive;").then((res) => {
        const row = res.rows[0] as { alive: number } | undefined;
        return row?.alive === 1;
      });

      const timeoutPromise = new Promise<boolean>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Postgres ping timeout")), timeoutMs);
      });

      return await Promise.race([pingPromise, timeoutPromise]);
    } catch {
      return false;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      if ("end" in this.#pool && typeof this.#pool.end === "function") {
        await this.#pool.end();
      }
    }
  }

  getUnderlyingClient(): pg.Pool | pg.Client {
    return this.#pool;
  }

  getDrizzle(): NodePgDatabase {
    return this.#drizzle;
  }
}
