import { AppError, decryptEnvelope, encryptEnvelope } from "@plinth/core";
import type { ConfigSetting, PersistedConfigSetting } from "../domain/setting.js";
import type { ConfigStoreRepositoryPort } from "../ports/repository.js";

export interface ConfigStoreOptions {
  readonly repository: ConfigStoreRepositoryPort;
  readonly masterKey?: Buffer | Uint8Array | undefined;
  readonly fallbacks?: Record<string, string> | undefined;
}

export interface SetConfigOptions {
  readonly isSecret?: boolean | undefined;
  readonly updatedBy?: string | undefined;
}

export class ConfigStore {
  readonly #repository: ConfigStoreRepositoryPort;
  readonly #masterKey?: Buffer | Uint8Array | undefined;
  readonly #fallbacks: Record<string, string>;

  constructor(options: ConfigStoreOptions) {
    this.#repository = options.repository;
    this.#masterKey = options.masterKey;
    this.#fallbacks = { ...(options.fallbacks ?? {}) };
  }

  async get(key: string): Promise<string | undefined> {
    const persisted = await this.#repository.get(key);
    if (!persisted) {
      return this.#fallbacks[key];
    }

    if (!persisted.isSecret) {
      return persisted.valueEncrypted;
    }

    if (!this.#masterKey) {
      throw new AppError(
        500,
        `Cannot decrypt secret config setting '${key}': Master key is not configured.`,
        { code: "MASTER_KEY_MISSING" },
      );
    }

    const decrypted = decryptEnvelope(persisted.valueEncrypted, this.#masterKey);
    return decrypted.toString("utf8");
  }

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const val = await this.get(key);
    if (val === undefined) {
      return defaultValue;
    }
    const normalized = val.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  async getNumber(key: string, defaultValue?: number): Promise<number> {
    const val = await this.get(key);
    if (val === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return Number.NaN;
    }
    const num = Number(val);
    if (Number.isNaN(num) && defaultValue !== undefined) {
      return defaultValue;
    }
    return num;
  }

  async set(key: string, value: string, options: SetConfigOptions = {}): Promise<void> {
    const isSecret = options.isSecret ?? false;
    let storedValue = value;

    if (isSecret) {
      if (!this.#masterKey) {
        throw new AppError(
          500,
          `Cannot encrypt secret config setting '${key}': Master key is not configured.`,
          { code: "MASTER_KEY_MISSING" },
        );
      }
      storedValue = encryptEnvelope(value, this.#masterKey);
    }

    const setting: PersistedConfigSetting = {
      key,
      valueEncrypted: storedValue,
      isSecret,
      updatedAt: new Date().toISOString(),
      ...(options.updatedBy ? { updatedBy: options.updatedBy } : {}),
    };

    await this.#repository.set(setting);
  }

  async list(): Promise<readonly ConfigSetting[]> {
    const persistedList = await this.#repository.list();
    return persistedList.map((p) => {
      const setting: ConfigSetting = {
        key: p.key,
        value: p.isSecret ? "[ENCRYPTED_SECRET]" : p.valueEncrypted,
        isSecret: p.isSecret,
        updatedAt: p.updatedAt,
      };
      if (p.updatedBy) {
        return { ...setting, updatedBy: p.updatedBy };
      }
      return setting;
    });
  }

  async delete(key: string): Promise<boolean> {
    return await this.#repository.delete(key);
  }
}
