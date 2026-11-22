import { AppError } from "@/errors/app-error.js";

export interface StorageObjectMetadata {
  readonly key: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly eTag?: string | undefined;
  readonly lastModified?: Date | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface PutObjectInput {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
  readonly contentLength?: number | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
  readonly isPublic?: boolean | undefined;
}

export interface PutObjectResult {
  readonly key: string;
  readonly eTag?: string | undefined;
  readonly url?: string | undefined;
}

export interface GetObjectInput {
  readonly key: string;
}

export interface GetObjectResult {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
  readonly contentLength: number;
  readonly eTag?: string | undefined;
  readonly lastModified?: Date | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface DeleteObjectInput {
  readonly key: string;
}

export interface DeleteObjectResult {
  readonly key: string;
  readonly deleted: boolean;
}

export interface HeadObjectInput {
  readonly key: string;
}

export interface HeadObjectResult {
  readonly exists: boolean;
  readonly metadata?: StorageObjectMetadata | undefined;
}

export interface GetSignedUrlInput {
  readonly key: string;
  readonly operation: "getObject" | "putObject";
  readonly expiresInSeconds: number;
  readonly contentType?: string | undefined;
}

export interface GetSignedUrlResult {
  readonly signedUrl: string;
  readonly expiresAt: Date;
}

export interface StoragePort {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  getSignedUrl(input: GetSignedUrlInput): Promise<GetSignedUrlResult>;
}

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Validates whether a storage key is well-formed, safe against directory traversal, and non-empty.
 */
export function validateStorageKey(key: string): boolean {
  if (typeof key !== "string" || key.trim().length === 0) {
    return false;
  }
  if (hasControlCharacters(key)) {
    return false;
  }
  const normalized = key.replace(/\\/g, "/");
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      return false;
    }
  }
  return true;
}

/**
 * Sanitizes and normalizes a storage key, rejecting directory traversal attempts and control characters.
 */
export function sanitizeStorageKey(key: string): string {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new AppError(400, "Storage key cannot be empty", { code: "INVALID_STORAGE_KEY" });
  }
  if (hasControlCharacters(key)) {
    throw new AppError(400, "Storage key contains invalid characters", {
      code: "INVALID_STORAGE_KEY",
    });
  }
  const normalized = key.replace(/\\/g, "/");
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new AppError(400, "Path traversal detected in storage key", {
        code: "INVALID_STORAGE_KEY",
      });
    }
  }

  // Remove leading and trailing slashes and collapse consecutive slashes
  const sanitized = segments.filter((s) => s.length > 0 && s !== ".").join("/");

  if (sanitized.length === 0) {
    throw new AppError(400, "Storage key cannot be empty", { code: "INVALID_STORAGE_KEY" });
  }

  return sanitized;
}
