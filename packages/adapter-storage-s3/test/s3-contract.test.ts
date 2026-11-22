import { S3StorageAdapter } from "@plinth/adapter-storage-s3";
import { runStorageContractTests } from "@plinth/contract-tests";
import { createMockS3Client } from "./mock-s3-client.js";

const { client, clear } = createMockS3Client();

runStorageContractTests({
  createAdapter: () => {
    return new S3StorageAdapter({
      bucket: "contract-test-bucket",
      client,
    });
  },
  cleanup: async () => {
    clear();
  },
});
