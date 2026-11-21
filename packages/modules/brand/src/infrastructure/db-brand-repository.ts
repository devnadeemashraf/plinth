import type { DatabasePort } from "@plinth/core";
import {
  type BrandConfig,
  DEFAULT_BRAND_CONFIG,
  mergeBrandConfig,
  type UpdateBrandDto,
} from "@plinth/modules-brand/domain/brand.js";
import type { BrandRepositoryPort } from "@plinth/modules-brand/ports/repository.js";

export class DbBrandRepository implements BrandRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initSchema(): Promise<void> {
    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS brand_config (
        id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    );
  }

  async get(): Promise<BrandConfig> {
    const rows = await this.#db.query<{ id: string; config_json: string; updated_at: string }>(
      "SELECT config_json FROM brand_config WHERE id = 'default' LIMIT 1;",
    );
    if (!rows[0]) {
      const initial = DEFAULT_BRAND_CONFIG;
      await this.#db.query(
        "INSERT INTO brand_config (id, config_json, updated_at) VALUES ('default', ?, ?);",
        [JSON.stringify(initial), new Date().toISOString()],
      );
      return initial;
    }
    return JSON.parse(rows[0].config_json) as BrandConfig;
  }

  async update(patch: UpdateBrandDto): Promise<BrandConfig> {
    return this.#db.transaction(async (tx: DatabasePort) => {
      const rows = await tx.query<{ id: string; config_json: string; updated_at: string }>(
        "SELECT config_json FROM brand_config WHERE id = 'default' LIMIT 1;",
      );
      const current = rows[0]
        ? (JSON.parse(rows[0].config_json) as BrandConfig)
        : DEFAULT_BRAND_CONFIG;
      const updated = mergeBrandConfig(current, patch);
      if (!rows[0]) {
        await tx.query(
          "INSERT INTO brand_config (id, config_json, updated_at) VALUES ('default', ?, ?);",
          [JSON.stringify(updated), new Date().toISOString()],
        );
      } else {
        await tx.query(
          "UPDATE brand_config SET config_json = ?, updated_at = ? WHERE id = 'default';",
          [JSON.stringify(updated), new Date().toISOString()],
        );
      }
      return updated;
    });
  }
}
