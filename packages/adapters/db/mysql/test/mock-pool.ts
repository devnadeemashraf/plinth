import Database from "better-sqlite3";
import type { Pool, PoolConnection } from "mysql2/promise";

export function createSimulatedMysqlPool(): Pool {
  const sqlite = new Database(":memory:");
  let inTx = false;
  let closed = false;

  const runQuery = (sql: string, params?: unknown[]) => {
    if (closed) {
      throw new Error("MySQL simulated pool is closed");
    }
    const stmt = sqlite.prepare(sql);
    if (!stmt.reader) {
      const info = stmt.run(...(params ?? []));
      return [{ insertId: Number(info.lastInsertRowid), affectedRows: info.changes }, []];
    }
    const rows = stmt.all(...(params ?? []));
    return [rows, []];
  };

  const connection = {
    query: async (sql: string, params?: unknown[]) => runQuery(sql, params),
    beginTransaction: async () => {
      sqlite.exec("BEGIN;");
      inTx = true;
    },
    commit: async () => {
      if (inTx) {
        sqlite.exec("COMMIT;");
        inTx = false;
      }
    },
    rollback: async () => {
      if (inTx) {
        sqlite.exec("ROLLBACK;");
        inTx = false;
      }
    },
    release: () => {},
  } as unknown as PoolConnection;

  const pool = {
    query: async (sql: string, params?: unknown[]) => runQuery(sql, params),
    getConnection: async () => connection,
    end: async () => {
      if (!closed) {
        closed = true;
        sqlite.close();
      }
    },
  } as unknown as Pool;

  return pool;
}
