import type { DatabasePort } from "@plinth/core";
import type { PersistedConfigSetting } from "../domain/setting.js";
import type { ConfigStoreRepositoryPort } from "../ports/repository.js";

interface DbConfigRow {
  key: string;
  value_encrypted: string;
  is_secret: number;
  updated_at: string;
  updated_by: string | null;
}

export class DbConfigStoreRepository implements ConfigStoreRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initializeSchema(): Promise<void> {
    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS config_settings (
        key TEXT PRIMARY KEY,
        value_encrypted TEXT NOT NULL,
        is_secret INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );`,
    );
  }

  async get(key: string): Promise<PersistedConfigSetting | null> {
    const rows = await this.#db.query<DbConfigRow>(
      "SELECT key, value_encrypted, is_secret, updated_at, updated_by FROM config_settings WHERE key = ? LIMIT 1;",
      [key],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const setting: PersistedConfigSetting = {
      key: row.key,
      valueEncrypted: row.value_encrypted,
      isSecret: row.is_secret === 1,
      updatedAt: row.updated_at,
    };
    if (row.updated_by !== null) {
      return { ...setting, updatedBy: row.updated_by };
    }
    return setting;
  }

  async set(setting: PersistedConfigSetting): Promise<void> {
    await this.#db.query(
      `INSERT INTO config_settings (key, value_encrypted, is_secret, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
         value_encrypted = excluded.value_encrypted,
         is_secret = excluded.is_secret,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by;`,
      [
        setting.key,
        setting.valueEncrypted,
        setting.isSecret ? 1 : 0,
        setting.updatedAt,
        setting.updatedBy ?? null,
      ],
    );
  }

  async list(): Promise<readonly PersistedConfigSetting[]> {
    const rows = await this.#db.query<DbConfigRow>(
      "SELECT key, value_encrypted, is_secret, updated_at, updated_by FROM config_settings ORDER BY key ASC;",
    );

    return rows.map((row) => {
      const setting: PersistedConfigSetting = {
        key: row.key,
        valueEncrypted: row.value_encrypted,
        isSecret: row.is_secret === 1,
        updatedAt: row.updated_at,
      };
      if (row.updated_by !== null) {
        return { ...setting, updatedBy: row.updated_by };
      }
      return setting;
    });
  }

  async delete(key: string): Promise<boolean> {
    const existing = await this.get(key);
    if (!existing) {
      return false;
    }
    await this.#db.query("DELETE FROM config_settings WHERE key = ?;", [key]);
    return true;
  }
}
