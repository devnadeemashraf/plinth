import { eq } from "drizzle-orm";
import { pgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "#platform/config/load.ts";
import { uuidV7Generator } from "#platform/kernel/ports/id-generator.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import { createTestDatabase, type TestDatabase } from "../../../../test/support/postgres.ts";
import { createDatabase, type Database } from "../client.ts";
import { citext, idColumn, timestampColumns } from "../columns.ts";

const silent: Logger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => silent,
};

const people = pgTable("people", {
  id: idColumn(),
  email: citext("email").notNull(),
  ...timestampColumns(),
});

let testDatabase: TestDatabase;
let database: Database;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
  database = createDatabase(loadConfig({ DATABASE_URL: testDatabase.url }), silent);
  await database.pool.query(
    `CREATE TABLE people (
       id uuid PRIMARY KEY,
       email citext NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
});

afterAll(async () => {
  await database.close();
  await testDatabase.drop();
});

describe("column helpers", () => {
  it("[P0-04 #9] In a citext column, insert `A@X.com`, query `a@x.COM` → one row", async () => {
    await database.db.insert(people).values({ id: uuidV7Generator.next(), email: "A@X.com" });

    const rows = await database.db.select().from(people).where(eq(people.email, "a@x.COM"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("A@X.com");
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
    expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
  });
});
