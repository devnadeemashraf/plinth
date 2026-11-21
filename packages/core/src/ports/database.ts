export interface DatabasePort {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T>;
  ping(timeoutMs?: number): Promise<boolean>;
  close(): Promise<void>;
  getUnderlyingClient(): unknown;
}
