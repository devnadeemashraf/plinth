export interface ConfigSetting {
  readonly key: string;
  readonly value: string;
  readonly isSecret: boolean;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

export interface PersistedConfigSetting {
  readonly key: string;
  readonly valueEncrypted: string;
  readonly isSecret: boolean;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}
