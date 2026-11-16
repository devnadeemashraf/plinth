import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { idColumn } from "../columns.ts";
import { declareHistory, historyDeclarationOf, undeclaredTables } from "../history.ts";
import * as fixture from "./fixtures/undeclared-schema.ts";

const accounts = pgTable("history_accounts", {
  id: idColumn(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

describe("declareHistory", () => {
  it("[P0-04 #6] A test-only schema module exporting a pgTable without `declareHistory` → the declarations test fails naming that table", () => {
    expect(undeclaredTables([fixture])).toEqual(["undeclared_probe"]);
  });

  it("[P0-04 #7] A tracked declaration omitting one column → `tsc` error (asserted with `@ts-expect-error`)", () => {
    const declare = () =>
      declareHistory(accounts, {
        mode: "tracked",
        // @ts-expect-error lastSeenAt is not classified
        columns: { id: "track", email: "track", passwordHash: "redact" },
      });
    expect(declare).toBeTypeOf("function");
  });

  it("records tracked and untracked declarations in the registry", () => {
    const columns = {
      id: "track",
      email: "track",
      passwordHash: "redact",
      lastSeenAt: "ignore",
    } as const;
    declareHistory(accounts, { mode: "tracked", columns });
    expect(historyDeclarationOf(accounts)).toEqual({ mode: "tracked", columns });
    expect(historyDeclarationOf(fixture.declaredProbe)).toEqual({
      mode: "untracked",
      reason: "test fixture",
    });
    expect(historyDeclarationOf(fixture.undeclaredProbe)).toBeUndefined();
  });
});
