import { AppError } from "@/errors/app-error.js";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB hard limit
export const MAX_AVATAR_DIMENSION = 4096; // 4096px to prevent decompression bombs
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type SupportedImageFormat = "png" | "jpeg" | "webp";

export interface ImageInfo {
  readonly format: SupportedImageFormat;
  readonly width: number;
  readonly height: number;
}

export interface CleanedAvatar {
  readonly buffer: Buffer;
  readonly format: SupportedImageFormat;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
}

const SVG_HTML_PATTERN = /<\s*(?:svg|script|html|\?xml|!doctype)/i;

/**
 * Inspects a raw buffer to verify magic bytes and extract dimensions.
 * Rejects SVGs, scripts, executables, oversized payloads, and decompression bombs.
 */
export function inspectImage(buffer: Buffer): ImageInfo {
  if (!Buffer.isBuffer(buffer)) {
    throw new AppError(400, "Avatar data must be a valid Buffer", { code: "INVALID_AVATAR" });
  }

  if (buffer.length < 12) {
    throw new AppError(400, "Image file too small or corrupted", { code: "INVALID_AVATAR" });
  }

  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new AppError(413, `Avatar size (${buffer.length} bytes) exceeds 5 MB limit`, {
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  // Pre-check: Reject text, SVG, XML, HTML payloads strictly to eliminate stored XSS
  const headerPreview = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8");
  if (SVG_HTML_PATTERN.test(headerPreview)) {
    throw new AppError(400, "SVG and HTML uploads are strictly forbidden for security", {
      code: "INVALID_AVATAR",
    });
  }

  // 1. Check PNG signature (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return inspectPng(buffer);
  }

  // 2. Check JPEG signature (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return inspectJpeg(buffer);
  }

  // 3. Check WebP signature (RIFF .... WEBP)
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return inspectWebp(buffer);
  }

  throw new AppError(400, "Unsupported image format. Only PNG, JPEG, and WebP are allowed.", {
    code: "INVALID_IMAGE_TYPE",
  });
}

function assertDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
    throw new AppError(
      400,
      `Image dimensions (${width}x${height}) exceed maximum allowed (${MAX_AVATAR_DIMENSION}x${MAX_AVATAR_DIMENSION})`,
      { code: "INVALID_AVATAR_DIMENSIONS" },
    );
  }
}

function inspectPng(buffer: Buffer): ImageInfo {
  // In PNG, IHDR chunk immediately follows the 8-byte signature
  if (buffer.length < 24) {
    throw new AppError(400, "Corrupted PNG header", { code: "INVALID_AVATAR" });
  }
  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType !== "IHDR") {
    throw new AppError(400, "Missing PNG IHDR chunk", { code: "INVALID_AVATAR" });
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assertDimensions(width, height);
  return { format: "png", width, height };
}

function inspectJpeg(buffer: Buffer): ImageInfo {
  let offset = 2; // Skip SOI (FF D8)
  let width = 0;
  let height = 0;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }
    // Skip padding FF bytes
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset++;
    }
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    if (marker === undefined) break;
    offset++;

    // SOF markers: SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (offset + 7 > buffer.length) {
        throw new AppError(400, "Corrupted JPEG SOF segment", { code: "INVALID_AVATAR" });
      }
      height = buffer.readUInt16BE(offset + 3);
      width = buffer.readUInt16BE(offset + 5);
      break;
    }

    // Stop at Start of Scan (0xDA) or End of Image (0xD9)
    if (marker === 0xda || marker === 0xd9) {
      break;
    }

    // Standalone markers
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    // Variable length marker
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    offset += length;
  }

  if (width === 0 || height === 0) {
    throw new AppError(400, "Failed to parse JPEG dimensions", { code: "INVALID_AVATAR" });
  }
  assertDimensions(width, height);
  return { format: "jpeg", width, height };
}

function inspectWebp(buffer: Buffer): ImageInfo {
  let offset = 12; // Start after 'RIFF' [4] + size [4] + 'WEBP' [4]
  let width = 0;
  let height = 0;

  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;

    if (chunkType === "VP8X") {
      if (payloadOffset + 10 <= buffer.length) {
        width = 1 + buffer.readUIntLE(payloadOffset + 4, 3);
        height = 1 + buffer.readUIntLE(payloadOffset + 7, 3);
        break;
      }
    } else if (chunkType === "VP8 ") {
      // Lossy simple
      if (payloadOffset + 10 <= buffer.length) {
        // Keyframe signature 9d 01 2a
        width = buffer.readUInt16LE(payloadOffset + 6) & 0x3fff;
        height = buffer.readUInt16LE(payloadOffset + 8) & 0x3fff;
        break;
      }
    } else if (chunkType === "VP8L") {
      // Lossless simple
      if (payloadOffset + 5 <= buffer.length && buffer[payloadOffset] === 0x2f) {
        const b0 = buffer[payloadOffset + 1] ?? 0;
        const b1 = buffer[payloadOffset + 2] ?? 0;
        const b2 = buffer[payloadOffset + 3] ?? 0;
        const b3 = buffer[payloadOffset + 4] ?? 0;
        width = 1 + (((b1 & 0x3f) << 8) | b0);
        height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        break;
      }
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (width === 0 || height === 0) {
    throw new AppError(400, "Failed to parse WebP dimensions", { code: "INVALID_AVATAR" });
  }
  assertDimensions(width, height);
  return { format: "webp", width, height };
}

/**
 * Strips EXIF, XMP, GPS, and metadata chunks from JPEG, PNG, and WebP buffers.
 */
export function stripImageMetadata(buffer: Buffer): {
  buffer: Buffer;
  format: SupportedImageFormat;
} {
  const info = inspectImage(buffer);

  if (info.format === "jpeg") {
    return { buffer: stripJpegMetadata(buffer), format: "jpeg" };
  }
  if (info.format === "png") {
    return { buffer: stripPngMetadata(buffer), format: "png" };
  }
  return { buffer: stripWebpMetadata(buffer), format: "webp" };
}

function stripJpegMetadata(buffer: Buffer): Buffer {
  let offset = 2; // Skip SOI (FF D8)
  const chunks: Buffer[] = [buffer.subarray(0, 2)];

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }

    const marker = buffer[offset + 1];

    // Start of Scan (FF DA): all remaining bytes are compressed image data
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    // Standalone markers
    if (
      marker === 0xd8 ||
      (marker !== undefined && marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      chunks.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);

    // Strip APP1-APP15 (0xE1-0xEF) and COM comments (0xFE)
    // APP0 (0xE0) JFIF is preserved
    const isMetadata =
      (marker !== undefined && marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

    if (!isMetadata) {
      chunks.push(buffer.subarray(offset, offset + 2 + segmentLength));
    }

    offset += 2 + segmentLength;
  }

  return Buffer.concat(chunks);
}

const STRIPPED_PNG_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "pHYs"]);

function stripPngMetadata(buffer: Buffer): Buffer {
  const chunks: Buffer[] = [buffer.subarray(0, 8)]; // Keep PNG signature
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const totalChunkLength = 12 + length; // 4 length + 4 type + data + 4 CRC

    if (offset + totalChunkLength > buffer.length) break;

    if (!STRIPPED_PNG_CHUNKS.has(type)) {
      chunks.push(buffer.subarray(offset, offset + totalChunkLength));
    }

    offset += totalChunkLength;

    if (type === "IEND") {
      break;
    }
  }

  return Buffer.concat(chunks);
}

function stripWebpMetadata(buffer: Buffer): Buffer {
  let cursor = 12; // Skip 'RIFF' + size + 'WEBP'
  const retainedChunks: Buffer[] = [];
  let hasVp8x = false;
  let vp8xIndex = -1;

  while (cursor + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", cursor, cursor + 4);
    const chunkSize = buffer.readUInt32LE(cursor + 4);
    const totalChunkLength = 8 + chunkSize + (chunkSize % 2);

    if (cursor + totalChunkLength > buffer.length) break;

    if (chunkType === "VP8X") {
      hasVp8x = true;
      vp8xIndex = retainedChunks.length;
      retainedChunks.push(Buffer.from(buffer.subarray(cursor, cursor + totalChunkLength)));
    } else if (chunkType === "EXIF" || chunkType === "XMP ") {
      // Strip metadata sub-chunk
    } else {
      retainedChunks.push(buffer.subarray(cursor, cursor + totalChunkLength));
    }

    cursor += totalChunkLength;
  }

  // Calculate new RIFF payload size (4 for 'WEBP' + chunks)
  let newPayloadSize = 4;
  for (const c of retainedChunks) {
    newPayloadSize += c.length;
  }

  // Clear EXIF (bit 3) and XMP (bit 2) flags from VP8X chunk if present
  if (hasVp8x && vp8xIndex >= 0) {
    const vp8xChunk = retainedChunks[vp8xIndex];
    if (vp8xChunk && vp8xChunk.length >= 9) {
      // Byte 8 is flags
      vp8xChunk[8] = (vp8xChunk[8] ?? 0) & ~0x08 & ~0x04;
    }
  }

  const riffHeader = Buffer.alloc(12);
  riffHeader.write("RIFF", 0, "ascii");
  riffHeader.writeUInt32LE(newPayloadSize, 4);
  riffHeader.write("WEBP", 8, "ascii");

  return Buffer.concat([riffHeader, ...retainedChunks]);
}

/**
 * Validates magic bytes, enforces dimension/byte boundaries, and losslessly strips all EXIF/metadata.
 */
export function validateAndCleanAvatar(rawBuffer: Buffer): CleanedAvatar {
  const info = inspectImage(rawBuffer);
  const stripped = stripImageMetadata(rawBuffer);
  const contentType = `image/${info.format}`;

  return {
    buffer: stripped.buffer,
    format: info.format,
    contentType,
    width: info.width,
    height: info.height,
  };
}
