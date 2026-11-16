/** A test-only schema module: one declared table, one table without a history declaration. */
import { pgTable, text } from "drizzle-orm/pg-core";
import { idColumn } from "../../columns.ts";
import { declareHistory } from "../../history.ts";

export const declaredProbe = pgTable("declared_probe", { id: idColumn(), note: text("note") });
declareHistory(declaredProbe, { mode: "untracked", reason: "test fixture" });

export const undeclaredProbe = pgTable("undeclared_probe", { id: idColumn() });

export const notATable = { name: "undeclared_probe_lookalike" };
