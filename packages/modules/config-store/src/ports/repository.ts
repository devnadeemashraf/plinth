import type { PersistedConfigSetting } from "../domain/setting.js";

export interface ConfigStoreRepositoryPort {
  get(key: string): Promise<PersistedConfigSetting | null>;
  set(setting: PersistedConfigSetting): Promise<void>;
  list(): Promise<readonly PersistedConfigSetting[]>;
  delete(key: string): Promise<boolean>;
}
