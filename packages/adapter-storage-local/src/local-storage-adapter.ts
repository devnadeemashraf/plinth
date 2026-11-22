import { createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
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

export interface LocalStorageOptions {
  readonly baseDir: string;
  readonly publicBaseUrl?: string | undefined;
  readonly signedUrlSecret?: string | undefined;
}

interface StoredMetadata {
  readonly contentType: string;
  readonly contentLength: number;
  readonly lastModified: string;
  readonly metadata?: Record<string, string> | undefined;
}

export class LocalStorageAdapter implements StoragePort {
  private readonly baseDir: string;
  private readonly normalizedBaseDir: string;
  private readonly publicBaseUrl: string;
  private readonly signedUrlSecret: string;

  constructor(options: LocalStorageOptions) {
    if (!options.baseDir || options.baseDir.trim().length === 0) {
      throw new AppError(500, "LocalStorage baseDir is required", {
        code: "INVALID_STORAGE_CONFIG",
      });
    }
    this.baseDir = resolve(options.baseDir);
    this.normalizedBaseDir = this.baseDir.endsWith(sep) ? this.baseDir : `${this.baseDir}${sep}`;
    this.publicBaseUrl = (options.publicBaseUrl ?? "http://localhost:3000/storage").replace(
      /\/+$/,
      "",
    );
    this.signedUrlSecret =
      options.signedUrlSecret ?? "plinth-local-storage-dev-secret-32-chars-long";
  }

  private resolveSafePath(rawKey: string): { key: string; filePath: string; metaPath: string } {
    const key = sanitizeStorageKey(rawKey);
    const filePath = resolve(this.baseDir, key);

    // Hard verification: ensure the target path strictly resides within the configured base directory
    if (!filePath.startsWith(this.normalizedBaseDir) && filePath !== this.baseDir) {
      throw new AppError(400, "Resolved path escapes base directory", {
        code: "PATH_TRAVERSAL_DETECTED",
      });
    }

    const metaPath = `${filePath}.meta.json`;
    return { key, filePath, metaPath };
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const { key, filePath, metaPath } = this.resolveSafePath(input.key);

    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.body);

    const meta: StoredMetadata = {
      contentType: input.contentType,
      contentLength: input.body.length,
      lastModified: new Date().toISOString(),
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

    const url = `${this.publicBaseUrl}/${key}`;
    return { key, url };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const { key, filePath, metaPath } = this.resolveSafePath(input.key);

    try {
      const body = await fs.readFile(filePath);
      let contentType = "application/octet-stream";
      let lastModified = new Date();
      let customMetadata: Record<string, string> | undefined;

      try {
        const metaRaw = await fs.readFile(metaPath, "utf8");
        const meta = JSON.parse(metaRaw) as StoredMetadata;
        contentType = meta.contentType || contentType;
        lastModified = new Date(meta.lastModified);
        customMetadata = meta.metadata;
      } catch {
        // If meta file is missing, stat file directly
        const stat = await fs.stat(filePath);
        lastModified = stat.mtime;
      }

      return {
        key,
        body,
        contentType,
        contentLength: body.length,
        lastModified,
        metadata: customMetadata,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundError(`Object '${key}' not found in storage`);
      }
      throw err;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    const { key, filePath, metaPath } = this.resolveSafePath(input.key);

    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    try {
      await fs.unlink(metaPath);
    } catch {
      // Ignored if meta doesn't exist
    }

    return { key, deleted: true };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const { key, filePath, metaPath } = this.resolveSafePath(input.key);

    try {
      const stat = await fs.stat(filePath);
      let contentType = "application/octet-stream";
      let lastModified = stat.mtime;
      let customMetadata: Record<string, string> | undefined;

      try {
        const metaRaw = await fs.readFile(metaPath, "utf8");
        const meta = JSON.parse(metaRaw) as StoredMetadata;
        contentType = meta.contentType || contentType;
        lastModified = new Date(meta.lastModified);
        customMetadata = meta.metadata;
      } catch {
        // Fall back to default
      }

      const metadata: StorageObjectMetadata = {
        key,
        contentType,
        contentLength: stat.size,
        lastModified,
        metadata: customMetadata,
      };

      return { exists: true, metadata };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { exists: false };
      }
      throw err;
    }
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<GetSignedUrlResult> {
    const { key } = this.resolveSafePath(input.key);
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    const expiresTimestamp = expiresAt.getTime().toString();

    const signature = this.computeSignature(key, input.operation, expiresTimestamp);
    const signedUrl = `${this.publicBaseUrl}/${key}?op=${input.operation}&expires=${expiresTimestamp}&sig=${signature}`;

    return { signedUrl, expiresAt };
  }

  computeSignature(key: string, operation: string, expiresTimestamp: string): string {
    const payload = `${key}:${operation}:${expiresTimestamp}`;
    return createHmac("sha256", this.signedUrlSecret).update(payload).digest("hex");
  }

  verifySignedUrl(
    key: string,
    operation: string,
    expiresTimestamp: string,
    providedSignature: string,
  ): boolean {
    const expiresMs = Number.parseInt(expiresTimestamp, 10);
    if (Number.isNaN(expiresMs) || Date.now() > expiresMs) {
      return false;
    }

    const expectedSignature = this.computeSignature(key, operation, expiresTimestamp);
    const expectedBuf = Buffer.from(expectedSignature, "utf8");
    const providedBuf = Buffer.from(providedSignature, "utf8");

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, providedBuf);
  }
}
