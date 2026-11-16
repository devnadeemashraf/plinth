import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { databaseUrl, TEMPLATE_DATABASE, withClient } from "./postgres-global.ts";

export interface TestDatabase {
  readonly name: string;
  readonly url: string;
  /** Drops the database, closing any connection still open to it. */
  drop(): Promise<void>;
}

export interface TestDatabaseOptions {
  /** `false` creates an empty database instead of a copy of the migrated template. */
  readonly migrated?: boolean;
}

/** A database of its own for one test file, on the run's shared Postgres server. */
export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  const serverUrl = inject("postgresUrl");
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const template = options.migrated === false ? "template1" : TEMPLATE_DATABASE;
  await withClient(serverUrl, (client) =>
    client.query(`CREATE DATABASE ${name} TEMPLATE ${template}`),
  );
  return {
    name,
    url: databaseUrl(serverUrl, name),
    drop: async () => {
      await withClient(serverUrl, (client) =>
        client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
      );
    },
  };
}
