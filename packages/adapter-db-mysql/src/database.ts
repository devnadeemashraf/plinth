import type { DatabasePort } from "@plinth/core";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

export interface MysqlDatabaseOptions {
  readonly connectionUri?: string | undefined;
  readonly pool?: Pool | undefined;
  readonly host?: string | undefined;
  readonly port?: number | undefined;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly database?: string | undefined;
  readonly connectionLimit?: number | undefined;
}

class MysqlTransactionAdapter implements DatabasePort {
  readonly #conn: PoolConnection;
  #closed = false;

  constructor(conn: PoolConnection) {
    this.#conn = conn;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.#closed) {
      throw new Error("MySQL transaction connection is closed");
    }
    const [rows] = await this.#conn.query(sql, params ?? []);
    return (Array.isArray(rows) ? rows : []) as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    if (this.#closed) {
      return false;
    }
    try {
      const [rows] = await this.#conn.query("SELECT 1 as alive;");
      const first = Array.isArray(rows) ? (rows[0] as { alive: number } | undefined) : undefined;
      return first?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
  }

  getUnderlyingClient(): PoolConnection {
    return this.#conn;
  }
}

export class MysqlDatabaseAdapter implements DatabasePort {
  readonly #pool: Pool;
  readonly #drizzle: MySql2Database;
  #closed = false;

  constructor(options?: MysqlDatabaseOptions) {
    if (options?.pool) {
      this.#pool = options.pool;
    } else if (options?.connectionUri) {
      this.#pool = mysql.createPool(options.connectionUri);
    } else {
      this.#pool = mysql.createPool({
        host: options?.host ?? "127.0.0.1",
        port: options?.port ?? 3306,
        user: options?.user ?? "root",
        password: options?.password ?? "",
        database: options?.database ?? "plinth",
        connectionLimit: options?.connectionLimit ?? 10,
        waitForConnections: true,
      });
    }

    this.#drizzle = drizzle(this.#pool);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (this.#closed) {
      throw new Error("MySQL database connection is closed");
    }

    const [rows] = await this.#pool.query(sql, params ?? []);
    return (Array.isArray(rows) ? rows : []) as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    if (this.#closed) {
      throw new Error("MySQL database connection is closed");
    }

    const conn = await this.#pool.getConnection();
    const txAdapter = new MysqlTransactionAdapter(conn);

    await conn.beginTransaction();
    try {
      const result = await fn(txAdapter);
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        // Ignore rollback failure if transaction already aborted
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async ping(timeoutMs = 2000): Promise<boolean> {
    if (this.#closed) {
      return false;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const pingPromise = this.#pool.query("SELECT 1 as alive;").then(([rows]) => {
        const first = Array.isArray(rows) ? (rows[0] as { alive: number } | undefined) : undefined;
        return first?.alive === 1;
      });

      const timeoutPromise = new Promise<boolean>((_, reject) => {
        timer = setTimeout(() => reject(new Error("MySQL ping timeout")), timeoutMs);
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
      await this.#pool.end();
    }
  }

  getUnderlyingClient(): Pool {
    return this.#pool;
  }

  getDrizzle(): MySql2Database {
    return this.#drizzle;
  }
}
