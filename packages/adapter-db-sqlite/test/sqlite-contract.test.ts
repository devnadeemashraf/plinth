import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { runDatabaseContractTests } from "@plinth/contract-tests";

runDatabaseContractTests({
  adapterName: "SqliteDatabaseAdapter",
  createAdapter: () => new SqliteDatabaseAdapter({ filename: ":memory:" }),
});
