import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../../../../test/support/postgres.ts";
import { withClient } from "../../../../test/support/postgres-global.ts";
import { runMigrate } from "../../../../test/support/process.ts";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
  entries: unknown[];
};

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function emptyDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase({ migrated: false });
  cleanups.push(() => database.drop());
  return database;
}

function recordedHashes(url: string): Promise<string[]> {
  return withClient(url, async (client) => {
    const result = await client.query<{ hash: string }>(
      "select hash from drizzle.__drizzle_migrations order by id",
    );
    return result.rows.map((row) => row.hash);
  });
}

/** A migrations folder with one migration, `0000_broken`, whose second statement is invalid. */
function brokenMigrations(): string {
  const folder = mkdtempSync(join(tmpdir(), "plinth-migrations-"));
  cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  mkdirSync(join(folder, "meta"));
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, version: "7", when: 1, tag: "0000_broken", breakpoints: true }],
    }),
  );
  writeFileSync(
    join(folder, "0000_broken.sql"),
    "CREATE TABLE probe (id integer);\n--> statement-breakpoint\nSELECT FROM WHERE;\n",
  );
  return folder;
}

describe("migrate process", () => {
  it("[P0-04 #3] Fresh database → migrate exits 0 and applies all migrations; a second run → exits 0 and applies none", async () => {
    const { url } = await emptyDatabase();

    const first = await runMigrate(url);
    expect(first.code, first.output).toBe(0);
    const applied = await recordedHashes(url);
    expect(applied).toHaveLength(journal.entries.length);

    const second = await runMigrate(url);
    expect(second.code, second.output).toBe(0);
    expect(second.output).toContain('"applied":0');
    expect(await recordedHashes(url)).toEqual(applied);
  });

  it("[P0-04 #4] Two migrate processes started together on an empty database → both exit 0 and each migration is recorded once", async () => {
    const { url } = await emptyDatabase();

    const results = await Promise.all([runMigrate(url), runMigrate(url)]);

    for (const result of results) {
      expect(result.code, result.output).toBe(0);
    }
    const hashes = await recordedHashes(url);
    expect(hashes).toHaveLength(journal.entries.length);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("[P0-04 #5] A migration file with invalid SQL in its second statement → exit 1 and its first statement is rolled back", async () => {
    const { url } = await emptyDatabase();

    const result = await runMigrate(url, brokenMigrations());

    expect(result.code).toBe(1);
    expect(result.output).toContain("0000_broken");
    const probe = await withClient(url, (client) =>
      client.query<{ table: string | null }>("select to_regclass('public.probe')::text as table"),
    );
    expect(probe.rows[0]?.table).toBeNull();
  });
});
