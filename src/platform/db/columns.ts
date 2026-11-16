import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * UUIDv7 primary key `id`. There is no database default: the repository sets the value from the
 * injected `IdGenerator`.
 */
export const idColumn = () => uuid("id").primaryKey();

/** `created_at` and `updated_at`, timestamptz, not null, default `now()`. */
export const timestampColumns = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Case-insensitive text, for emails and usernames. Needs the `citext` extension (first migration). */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});
