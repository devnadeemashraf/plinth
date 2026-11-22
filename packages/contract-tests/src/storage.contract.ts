import type { StoragePort } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface StorageContractOptions {
  readonly createAdapter: () => Promise<StoragePort> | StoragePort;
  readonly cleanup?: (() => Promise<void>) | undefined;
}

export function runStorageContractTests(options: StorageContractOptions): void {
  describe("Storage Adapter Contract Tests", () => {
    it("1. Object CRUD - should put, get, head, and delete objects", async () => {
      const storage = await options.createAdapter();
      const testKey = `test-${Date.now()}/sample.txt`;
      const content = Buffer.from("Hello Plinth Storage!", "utf8");

      // Put
      const putResult = await storage.putObject({
        key: testKey,
        body: content,
        contentType: "text/plain",
      });
      expect(putResult.key).toBe(testKey);

      // Head
      const headBefore = await storage.headObject({ key: testKey });
      expect(headBefore.exists).toBe(true);
      expect(headBefore.metadata?.contentType).toBe("text/plain");
      expect(headBefore.metadata?.contentLength).toBe(content.length);

      // Get
      const getResult = await storage.getObject({ key: testKey });
      expect(getResult.key).toBe(testKey);
      expect(getResult.contentType).toBe("text/plain");
      expect(getResult.contentLength).toBe(content.length);
      expect(getResult.body.toString("utf8")).toBe("Hello Plinth Storage!");

      // Delete
      const deleteResult = await storage.deleteObject({ key: testKey });
      expect(deleteResult.deleted).toBe(true);

      // Head after delete
      const headAfter = await storage.headObject({ key: testKey });
      expect(headAfter.exists).toBe(false);

      // Get after delete should throw
      await expect(storage.getObject({ key: testKey })).rejects.toThrow();

      if (options.cleanup) {
        await options.cleanup();
      }
    });

    it("2. Signed URLs - should generate valid signed URLs for get and put", async () => {
      const storage = await options.createAdapter();
      const testKey = `signed-${Date.now()}/avatar.png`;

      const getSigned = await storage.getSignedUrl({
        key: testKey,
        operation: "getObject",
        expiresInSeconds: 300,
      });

      expect(typeof getSigned.signedUrl).toBe("string");
      expect(getSigned.signedUrl.length).toBeGreaterThan(10);
      expect(getSigned.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const putSigned = await storage.getSignedUrl({
        key: testKey,
        operation: "putObject",
        expiresInSeconds: 300,
        contentType: "image/png",
      });

      expect(typeof putSigned.signedUrl).toBe("string");
      expect(putSigned.expiresAt.getTime()).toBeGreaterThan(Date.now());

      if (options.cleanup) {
        await options.cleanup();
      }
    });

    it("3. Binary Data Integrity - should preserve binary buffers verbatim", async () => {
      const storage = await options.createAdapter();
      const testKey = `binary-${Date.now()}/bytes.bin`;
      const binaryData = Buffer.from([0x00, 0xff, 0x12, 0x34, 0x89, 0x50, 0x4e, 0x47]);

      await storage.putObject({
        key: testKey,
        body: binaryData,
        contentType: "application/octet-stream",
      });

      const retrieved = await storage.getObject({ key: testKey });
      expect(retrieved.body).toEqual(binaryData);

      await storage.deleteObject({ key: testKey });

      if (options.cleanup) {
        await options.cleanup();
      }
    });
  });
}
