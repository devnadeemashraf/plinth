import { S3StorageAdapter } from "@plinth/adapter-storage-s3";
import { describe, expect, it } from "vitest";
import { createMockS3Client } from "./mock-s3-client.js";

describe("S3StorageAdapter - Unit Tests with Mock Client", () => {
  it("should initialize with default config when bucket is provided", () => {
    const adapter = new S3StorageAdapter({
      bucket: "my-test-bucket",
      region: "us-west-2",
      publicUrlPrefix: "https://cdn.example.com",
    });
    expect(adapter).toBeDefined();
  });

  it("should fail fast if bucket name is empty", () => {
    expect(() => new S3StorageAdapter({ bucket: "" })).toThrow();
  });

  it("should put, get, head, and delete objects using simulated S3 client", async () => {
    const { client, clear } = createMockS3Client();
    clear();

    const adapter = new S3StorageAdapter({
      bucket: "my-test-bucket",
      client,
      publicUrlPrefix: "https://cdn.example.com",
    });

    const key = "avatars/alice.png";
    const body = Buffer.from("fake png bytes");

    // Put
    const putRes = await adapter.putObject({
      key,
      body,
      contentType: "image/png",
    });
    expect(putRes.key).toBe(key);
    expect(putRes.url).toBe("https://cdn.example.com/avatars/alice.png");
    expect(putRes.eTag).toBe("test-etag-123");

    // Head
    const headRes = await adapter.headObject({ key });
    expect(headRes.exists).toBe(true);
    expect(headRes.metadata?.contentType).toBe("image/png");
    expect(headRes.metadata?.contentLength).toBe(body.length);

    // Get
    const getRes = await adapter.getObject({ key });
    expect(getRes.key).toBe(key);
    expect(getRes.body).toEqual(body);
    expect(getRes.contentType).toBe("image/png");

    // Delete
    const delRes = await adapter.deleteObject({ key });
    expect(delRes.deleted).toBe(true);

    // Head after delete
    const headAfter = await adapter.headObject({ key });
    expect(headAfter.exists).toBe(false);

    // Get after delete should throw NotFoundError
    await expect(adapter.getObject({ key })).rejects.toThrow();
  });
});
