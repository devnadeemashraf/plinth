import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "#platform/db/columns.ts";
import { declareHistory } from "#platform/db/history.ts";

export const plans = pgTable(
  "plans",
  {
    id: idColumn(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    audience: text("audience", { enum: ["user", "tenant"] }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    ...timestampColumns(),
  },
  (table) => [
    check("plans_audience_check", sql`${table.audience} in ('user', 'tenant')`),
    uniqueIndex("plans_default_per_audience").on(table.audience).where(sql`${table.isDefault}`),
  ],
);

declareHistory(plans, {
  mode: "tracked",
  columns: {
    id: "track",
    key: "track",
    name: "track",
    audience: "track",
    isDefault: "track",
    sort: "track",
    createdAt: "ignore",
    updatedAt: "ignore",
  },
});
