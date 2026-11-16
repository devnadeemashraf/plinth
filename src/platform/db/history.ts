import { getTableName, is, type Table } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

/** `track` keeps before/after values, `redact` records only that it changed, `ignore` skips it. */
export type ColumnHistory = "track" | "redact" | "ignore";

export type HistoryDeclaration<T extends Table> =
  | {
      readonly mode: "tracked";
      /** Every column of the table, classified. */
      readonly columns: { readonly [K in keyof T["_"]["columns"]]: ColumnHistory };
    }
  | { readonly mode: "untracked"; readonly reason: string };

const declarations = new Map<Table, HistoryDeclaration<Table>>();

/** Declares how changes to `table` enter the activity history (SPEC §6.10). Call it beside the table. */
export function declareHistory<T extends Table>(
  table: T,
  declaration: HistoryDeclaration<T>,
): void {
  declarations.set(table, declaration as HistoryDeclaration<Table>);
}

export function historyDeclarationOf(table: Table): HistoryDeclaration<Table> | undefined {
  return declarations.get(table);
}

/** Names of the pgTables exported by the given schema modules that have no history declaration. */
export function undeclaredTables(schemaModules: readonly Record<string, unknown>[]): string[] {
  return schemaModules
    .flatMap((exports) => Object.values(exports))
    .filter((value): value is PgTable => is(value, PgTable) && !declarations.has(value))
    .map((table) => getTableName(table));
}
