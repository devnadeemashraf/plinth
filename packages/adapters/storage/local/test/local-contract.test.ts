import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { LocalStorageAdapter } from "@plinth/adapter-storage-local";
import { runStorageContractTests } from "@plinth/contract-tests";

const tempBaseDir = resolve(".tmp-storage-contract");

runStorageContractTests({
  createAdapter: () => new LocalStorageAdapter({ baseDir: tempBaseDir }),
  cleanup: async () => {
    try {
      await fs.rm(tempBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  },
});
