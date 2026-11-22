import { MysqlDatabaseAdapter } from "@plinth/adapter-db-mysql";
import { runDatabaseContractTests } from "@plinth/contract-tests";
import { createSimulatedMysqlPool } from "./mock-pool.js";

runDatabaseContractTests({
  adapterName: "MysqlDatabaseAdapter",
  createAdapter: () => {
    const pool = createSimulatedMysqlPool();
    return new MysqlDatabaseAdapter({ pool });
  },
});
