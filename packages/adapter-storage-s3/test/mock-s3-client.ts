import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

interface StoredObject {
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string> | undefined;
  lastModified: Date;
}

export function createMockS3Client(): {
  client: S3Client;
  store: Map<string, StoredObject>;
  clear: () => void;
} {
  const store = new Map<string, StoredObject>();

  const realClient = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
  });

  // Intercept send calls to use our in-memory store
  realClient.send = (async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      const input = command.input;
      const key = input.Key ?? "default-key";
      const body = Buffer.isBuffer(input.Body) ? input.Body : Buffer.from(input.Body as Uint8Array);
      store.set(key, {
        body,
        contentType: input.ContentType ?? "application/octet-stream",
        metadata: input.Metadata,
        lastModified: new Date(),
      });
      return { ETag: '"test-etag-123"' };
    }

    if (command instanceof GetObjectCommand) {
      const key = command.input.Key ?? "default-key";
      const item = store.get(key);
      if (!item) {
        const err = new Error("NoSuchKey");
        err.name = "NoSuchKey";
        throw err;
      }
      return {
        Body: {
          transformToByteArray: async () => new Uint8Array(item.body),
        },
        ContentType: item.contentType,
        ContentLength: item.body.length,
        LastModified: item.lastModified,
        Metadata: item.metadata,
        ETag: '"test-etag-123"',
      };
    }

    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key ?? "default-key";
      const item = store.get(key);
      if (!item) {
        const err = new Error("NotFound");
        err.name = "NotFound";
        throw err;
      }
      return {
        ContentType: item.contentType,
        ContentLength: item.body.length,
        LastModified: item.lastModified,
        Metadata: item.metadata,
        ETag: '"test-etag-123"',
      };
    }

    if (command instanceof DeleteObjectCommand) {
      const key = command.input.Key ?? "default-key";
      store.delete(key);
      return {};
    }

    throw new Error(
      `Unhandled command: ${(command as { constructor?: { name?: string } }).constructor?.name}`,
    );
  }) as typeof realClient.send;

  return {
    client: realClient,
    store,
    clear: () => store.clear(),
  };
}
