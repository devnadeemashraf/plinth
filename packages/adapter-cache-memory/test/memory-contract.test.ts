import { MemoryCacheAdapter } from "@plinth/adapter-cache-memory";
import { runCacheContractTests } from "@plinth/contract-tests";

runCacheContractTests({
  adapterName: "MemoryCacheAdapter",
  createAdapter: () => new MemoryCacheAdapter(),
});
