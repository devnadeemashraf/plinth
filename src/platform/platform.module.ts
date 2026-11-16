import { asFunction } from "awilix";
import type { ModuleManifest } from "#platform/kernel/module.ts";
import { createDatabase, type Database } from "./db/client.ts";

declare module "./di/cradle.ts" {
  interface Cradle {
    database: Database;
  }
}

/** Platform services that need a lifecycle: the database pool and its readiness check. */
export const platformModule: ModuleManifest = {
  name: "platform",
  register(container, config) {
    container.register({
      database: asFunction(({ logger }) => createDatabase(config, logger))
        .singleton()
        .disposer((database) => database.close()),
    });
  },
  routes: () => [],
  readiness(container) {
    const { database } = container.cradle;
    return [
      {
        name: "postgres",
        check: async () => {
          await database.pool.query("select 1");
        },
      },
    ];
  },
};
