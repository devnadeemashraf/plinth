import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { DbQueueAdapter } from "@plinth/adapter-queue-db";
import { runQueueContractTests } from "@plinth/contract-tests";

runQueueContractTests({
  adapterName: "DbQueueAdapter (SQLite in-memory)",
  createQueue: () => {
    const db = new SqliteDatabaseAdapter({ filename: ":memory:" });
    return new DbQueueAdapter({
      db,
      pollIntervalMs: 20,
    });
  },
});
