import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";
import { PostgresDatabaseAdapter } from "@plinth/adapter-db-postgres";
import { runDatabaseContractTests, runTenancyRlsContractTests } from "@plinth/contract-tests";
import pg from "pg";

const createTestPostgresAdapter = () => {
  const pglite = new PGlite();
  const pool = new pg.Pool(createPgConfig(pglite));
  return new PostgresDatabaseAdapter({ pool });
};

runDatabaseContractTests({
  adapterName: "PostgresDatabaseAdapter",
  createAdapter: createTestPostgresAdapter,
});

runTenancyRlsContractTests({
  adapterName: "PostgresDatabaseAdapter (Row-Level Security)",
  createAdapter: createTestPostgresAdapter,
});
