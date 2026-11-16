/**
 * Vitest global setup: starts one Postgres container per run, applies every migration to the
 * database `plinth_template`, and provides the server's admin URL to the tests.
 * Test files clone the template with `createTestDatabase()` from `./postgres.ts`.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Admin connection URL of the run's Postgres server. */
    postgresUrl: string;
  }
}

export const POSTGRES_IMAGE = "postgres:18.7-alpine";
export const TEMPLATE_DATABASE = "plinth_template";

/** The same server URL pointing at another database. */
export function databaseUrl(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const serverUrl = container.getConnectionUri();
  await withClient(serverUrl, (client) => client.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`));
  await withClient(databaseUrl(serverUrl, TEMPLATE_DATABASE), (client) =>
    migrate(drizzle({ client }), { migrationsFolder: "drizzle" }),
  );
  project.provide("postgresUrl", serverUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
