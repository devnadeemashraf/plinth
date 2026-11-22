import { RedisCacheAdapter } from "@plinth/adapter-cache-redis";
import { runCacheContractTests } from "@plinth/contract-tests";
import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";

const mockRedis = new RedisMock();

runCacheContractTests({
  adapterName: "RedisCacheAdapter (ioredis-mock)",
  createAdapter: () =>
    new RedisCacheAdapter({
      client: mockRedis as unknown as Redis,
      keyPrefix: "test-contract:",
    }),
  cleanup: async () => {
    await mockRedis.flushall();
  },
});
