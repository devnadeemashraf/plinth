import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AppError,
  type DeleteObjectInput,
  type DeleteObjectResult,
  type GetObjectInput,
  type GetObjectResult,
  type GetSignedUrlInput,
  type GetSignedUrlResult,
  type HeadObjectInput,
  type HeadObjectResult,
  NotFoundError,
  type PutObjectInput,
  type PutObjectResult,
  type StorageObjectMetadata,
  type StoragePort,
  sanitizeStorageKey,
} from "@plinth/core";

export interface S3StorageOptions {
  readonly bucket: string;
  readonly region?: string | undefined;
  readonly endpoint?: string | undefined;
  readonly credentials?:
    | {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
      }
    | undefined;
  readonly forcePathStyle?: boolean | undefined;
  readonly publicUrlPrefix?: string | undefined;
  readonly client?: S3Client | undefined;
}

export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlPrefix?: string | undefined;

  constructor(options: S3StorageOptions) {
    if (!options.bucket || options.bucket.trim().length === 0) {
      throw new AppError(500, "S3 bucket name is required", { code: "INVALID_STORAGE_CONFIG" });
    }
    this.bucket = options.bucket;
    this.publicUrlPrefix = options.publicUrlPrefix?.replace(/\/+$/, "");

    if (options.client) {
      this.client = options.client;
    } else {
      const clientConfig: S3ClientConfig = {
        region: options.region ?? "us-east-1",
        forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
        ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
      };
      if (options.credentials) {
        clientConfig.credentials = {
          accessKeyId: options.credentials.accessKeyId,
          secretAccessKey: options.credentials.secretAccessKey,
        };
      }
      this.client = new S3Client(clientConfig);
    }
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const key = sanitizeStorageKey(input.key);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata ? { ...input.metadata } : undefined,
    });

    const response = await this.client.send(command);
    const url = this.publicUrlPrefix ? `${this.publicUrlPrefix}/${key}` : undefined;

    return {
      key,
      eTag: response.ETag?.replace(/"/g, ""),
      url,
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const key = sanitizeStorageKey(input.key);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const response = await this.client.send(command);
      if (!response.Body) {
        throw new NotFoundError(`Object '${key}' has no body`);
      }

      const byteArray = await response.Body.transformToByteArray();
      const body = Buffer.from(byteArray);

      return {
        key,
        body,
        contentType: response.ContentType ?? "application/octet-stream",
        contentLength: response.ContentLength ?? body.length,
        eTag: response.ETag?.replace(/"/g, ""),
        lastModified: response.LastModified ?? new Date(),
        metadata: response.Metadata,
      };
    } catch (err) {
      if (
        (err as { name?: string }).name === "NoSuchKey" ||
        (err as { name?: string }).name === "NotFound" ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundError(`Object '${key}' not found in S3 bucket '${this.bucket}'`);
      }
      throw err;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    const key = sanitizeStorageKey(input.key);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
    return { key, deleted: true };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const key = sanitizeStorageKey(input.key);

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const response = await this.client.send(command);
      const metadata: StorageObjectMetadata = {
        key,
        contentType: response.ContentType ?? "application/octet-stream",
        contentLength: response.ContentLength ?? 0,
        eTag: response.ETag?.replace(/"/g, ""),
        lastModified: response.LastModified ?? new Date(),
        metadata: response.Metadata,
      };
      return { exists: true, metadata };
    } catch (err) {
      if (
        (err as { name?: string }).name === "NoSuchKey" ||
        (err as { name?: string }).name === "NotFound" ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      ) {
        return { exists: false };
      }
      throw err;
    }
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<GetSignedUrlResult> {
    const key = sanitizeStorageKey(input.key);
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);

    const command =
      input.operation === "putObject"
        ? new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: input.contentType,
          })
        : new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
          });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
    });

    return { signedUrl, expiresAt };
  }
}
