import type { DatabasePort } from "@plinth/core";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

export interface SqliteDatabaseOptions {
  readonly filename?: string | undefined;
  readonly readonly?: boolean | undefined;
}

export class SqliteDatabaseAdapter implements DatabasePort {
  readonly #db: Database.Database;
  readonly #drizzle: BetterSQLite3Database;
  #closed = false;

  constructor(options?: SqliteDatabaseOptions) {
    const filename = options?.filename ?? ":memory:";
    this.#db = new Database(filename, {
      readonly: options?.readonly ?? false,
    });

    // Enable WAL mode for file-based DBs for high-concurrency throughput
    if (filename !== ":memory:") {
      this.#db.pragma("journal_mode = WAL");
    }
    this.#db.pragma("foreign_keys = ON");

    this.#drizzle = drizzle(this.#db);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.#closed || !this.#db.open) {
      throw new Error("SQLite database connection is closed");
    }

    const stmt = this.#db.prepare(sql);
    if (!stmt.reader) {
      stmt.run(...(params ?? []));
      return [] as T[];
    }

    const rows = stmt.all(...(params ?? []));
    return rows as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    if (this.#closed || !this.#db.open) {
      throw new Error("SQLite database connection is closed");
    }

    await this.query("BEGIN TRANSACTION;");
    try {
      const result = await fn(this);
      await this.query("COMMIT;");
      return result;
    } catch (error) {
      try {
        await this.query("ROLLBACK;");
      } catch {
        // Rollback failed (e.g. if transaction already rolled back)
      }
      throw error;
    }
  }

  async ping(timeoutMs = 2000): Promise<boolean> {
    if (this.#closed || !this.#db.open) {
      return false;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const pingPromise = Promise.resolve().then(() => {
        const stmt = this.#db.prepare("SELECT 1 as alive;");
        const row = stmt.get() as { alive: number } | undefined;
        return row?.alive === 1;
      });

      const timeoutPromise = new Promise<boolean>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DB ping timeout")), timeoutMs);
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
      if (this.#db.open) {
        this.#db.close();
      }
    }
  }

  getUnderlyingClient(): Database.Database {
    return this.#db;
  }

  getDrizzle(): BetterSQLite3Database {
    return this.#drizzle;
  }
}
