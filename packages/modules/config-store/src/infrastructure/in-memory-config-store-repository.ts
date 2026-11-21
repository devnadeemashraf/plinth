import type { PersistedConfigSetting } from "../domain/setting.js";
import type { ConfigStoreRepositoryPort } from "../ports/repository.js";

export class InMemoryConfigStoreRepository implements ConfigStoreRepositoryPort {
  readonly #items = new Map<string, PersistedConfigSetting>();

  async get(key: string): Promise<PersistedConfigSetting | null> {
    return this.#items.get(key) ?? null;
  }

  async set(setting: PersistedConfigSetting): Promise<void> {
    this.#items.set(setting.key, setting);
  }

  async list(): Promise<readonly PersistedConfigSetting[]> {
    return Array.from(this.#items.values());
  }

  async delete(key: string): Promise<boolean> {
    return this.#items.delete(key);
  }
}
