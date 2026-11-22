import { StubAnalyticsAdapter } from "@plinth/adapter-analytics-stub";
import { runAnalyticsContractTests } from "@plinth/contract-tests";

const adapter = new StubAnalyticsAdapter();

runAnalyticsContractTests({
  createAdapter: async () => ({
    adapter,
    getEvents: () => adapter.getEvents(),
    clear: () => adapter.clear(),
  }),
});
