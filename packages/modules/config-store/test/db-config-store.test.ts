import type { DatabasePort } from "@plinth/core";
import { DbConfigStoreRepository } from "@plinth/modules-config-store/infrastructure/db-config-store-repository.js";
import { beforeEach, describe, expect, it } from "vitest";

interface DbConfigRow {
  key: string;
  value_encrypted: string;
  is_secret: number;
  updated_at: string;
  updated_by: string | null;
}

class MockConfigDatabasePort implements DatabasePort {
  readonly items = new Map<string, DbConfigRow>();

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes("CREATE TABLE")) {
      return [] as T[];
    }
    if (
      sql.includes(
        "SELECT key, value_encrypted, is_secret, updated_at, updated_by FROM config_settings WHERE key = ?",
      )
    ) {
      const key = params[0] as string;
      const found = this.items.get(key);
      return (found ? [found] : []) as T[];
    }
    if (
      sql.includes(
        "SELECT key, value_encrypted, is_secret, updated_at, updated_by FROM config_settings ORDER BY key ASC",
      )
    ) {
      const sorted = Array.from(this.items.values()).sort((a, b) => a.key.localeCompare(b.key));
      return sorted as T[];
    }
    if (sql.includes("INSERT INTO config_settings")) {
      const row: DbConfigRow = {
        key: params[0] as string,
        value_encrypted: params[1] as string,
        is_secret: params[2] as number,
        updated_at: params[3] as string,
        updated_by: (params[4] as string | null) ?? null,
      };
      this.items.set(row.key, row);
      return [] as T[];
    }
    if (sql.includes("DELETE FROM config_settings WHERE key = ?")) {
      const key = params[0] as string;
      this.items.delete(key);
      return [] as T[];
    }
    return [] as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  getUnderlyingClient(): unknown {
    return this;
  }
}

describe("DbConfigStoreRepository SQL Adapter", () => {
  let db: MockConfigDatabasePort;
  let repo: DbConfigStoreRepository;

  beforeEach(async () => {
    db = new MockConfigDatabasePort();
    repo = new DbConfigStoreRepository(db);
    await repo.initializeSchema();
  });

  it("sets, gets, lists, and deletes persisted config settings", async () => {
    expect(await repo.get("app.theme")).toBeNull();

    await repo.set({
      key: "app.theme",
      valueEncrypted: "dark",
      isSecret: false,
      updatedAt: "2026-11-21T00:00:00.000Z",
      updatedBy: "usr_admin",
    });

    const setting = await repo.get("app.theme");
    expect(setting).not.toBeNull();
    expect(setting?.key).toBe("app.theme");
    expect(setting?.valueEncrypted).toBe("dark");
    expect(setting?.isSecret).toBe(false);
    expect(setting?.updatedBy).toBe("usr_admin");

    await repo.set({
      key: "app.secret",
      valueEncrypted: "enc:v1:xyz",
      isSecret: true,
      updatedAt: "2026-11-21T00:00:00.000Z",
    });

    const list = await repo.list();
    expect(list.length).toBe(2);

    const deleted = await repo.delete("app.theme");
    expect(deleted).toBe(true);

    const missingDeleted = await repo.delete("non.existent");
    expect(missingDeleted).toBe(false);

    expect(await repo.get("app.theme")).toBeNull();
  });
});
