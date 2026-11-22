import { describe, expect, it } from "vitest";
import {
  inspectImage,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_DIMENSION,
  stripImageMetadata,
  validateAndCleanAvatar,
} from "@/security/avatar-guard.js";

function createValidPngBuffer(width = 100, height = 100, withExif = false): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR chunk: length 13, type "IHDR", width (4 bytes BE), height (4 bytes BE), 5 bytes mode, 4 bytes dummy CRC
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR", "ascii"),
    ihdrData,
    Buffer.from([0x12, 0x34, 0x56, 0x78]), // CRC
  ]);

  const chunks = [signature, ihdrChunk];

  if (withExif) {
    const exifData = Buffer.from("Sensitive GPS Location Data: 37.7749,-122.4194");
    const exifLen = Buffer.alloc(4);
    exifLen.writeUInt32BE(exifData.length, 0);
    const exifChunk = Buffer.concat([
      exifLen,
      Buffer.from("eXIf", "ascii"),
      exifData,
      Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]),
    ]);
    chunks.push(exifChunk);

    const textData = Buffer.from("Author\0John Doe");
    const textLen = Buffer.alloc(4);
    textLen.writeUInt32BE(textData.length, 0);
    const textChunk = Buffer.concat([
      textLen,
      Buffer.from("tEXt", "ascii"),
      textData,
      Buffer.from([0xee, 0xff, 0x00, 0x11]),
    ]);
    chunks.push(textChunk);
  }

  // IDAT chunk (minimal dummy pixel)
  const idatData = Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(idatData.length, 0);
  const idatChunk = Buffer.concat([
    idatLen,
    Buffer.from("IDAT", "ascii"),
    idatData,
    Buffer.from([0x99, 0x88, 0x77, 0x66]),
  ]);
  chunks.push(idatChunk);

  // IEND chunk
  const iendChunk = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("IEND", "ascii"),
    Buffer.from([0xae, 0x42, 0x60, 0x82]),
  ]);
  chunks.push(iendChunk);

  return Buffer.concat(chunks);
}

function createValidJpegBuffer(width = 200, height = 150, withExif = false): Buffer {
  const parts: Buffer[] = [];
  // SOI (FF D8)
  parts.push(Buffer.from([0xff, 0xd8]));

  // APP0 (JFIF)
  const jfifData = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48,
    0x00, 0x00,
  ]);
  parts.push(jfifData);

  if (withExif) {
    // APP1 (EXIF) segment: marker FF E1, length 2 bytes BE, payload "Exif\0\0..."
    const exifPayload = Buffer.from("Exif\0\0Sensitive GPS Location Data: 37.77,-122.41;");
    const len = exifPayload.length + 2;
    const app1Header = Buffer.alloc(4);
    app1Header[0] = 0xff;
    app1Header[1] = 0xe1;
    app1Header.writeUInt16BE(len, 2);
    parts.push(Buffer.concat([app1Header, exifPayload]));

    // COM comment segment: marker FF FE, length 2 bytes
    const commentPayload = Buffer.from("Internal User Comment");
    const comLen = commentPayload.length + 2;
    const comHeader = Buffer.alloc(4);
    comHeader[0] = 0xff;
    comHeader[1] = 0xfe;
    comHeader.writeUInt16BE(comLen, 2);
    parts.push(Buffer.concat([comHeader, commentPayload]));
  }

  // SOF0 (Start of Frame: FF C0) with dimensions
  const sofPayload = Buffer.alloc(11);
  sofPayload.writeUInt16BE(11 + 2, 0); // length (13)
  sofPayload[2] = 8; // precision
  sofPayload.writeUInt16BE(height, 3); // height
  sofPayload.writeUInt16BE(width, 5); // width
  sofPayload[7] = 3; // components
  sofPayload[8] = 1;
  sofPayload[9] = 2;
  sofPayload[10] = 3;

  parts.push(Buffer.concat([Buffer.from([0xff, 0xc0]), sofPayload]));

  // SOS (Start of Scan: FF DA)
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));

  // Image data bytes
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0x78]));

  // EOI (FF D9)
  parts.push(Buffer.from([0xff, 0xd9]));

  return Buffer.concat(parts);
}

function createValidWebpBuffer(width = 300, height = 250, withExif = false): Buffer {
  const chunks: Buffer[] = [];

  // VP8X extended chunk (10 bytes data)
  // Flags at byte 8: bit 3 = EXIF (0x08), bit 2 = XMP (0x04)
  const flags = withExif ? 0x08 | 0x04 : 0x00;
  const vp8xPayload = Buffer.alloc(10);
  vp8xPayload[0] = flags;
  // Canvas width - 1 (24-bit LE)
  vp8xPayload.writeUIntLE(width - 1, 4, 3);
  // Canvas height - 1 (24-bit LE)
  vp8xPayload.writeUIntLE(height - 1, 7, 3);

  const vp8xChunk = Buffer.concat([
    Buffer.from("VP8X", "ascii"),
    Buffer.from([0x0a, 0x00, 0x00, 0x00]), // size 10
    vp8xPayload,
  ]);
  chunks.push(vp8xChunk);

  if (withExif) {
    // EXIF chunk
    const exifPayload = Buffer.from("ExifDataGPSCoordinatesAndMetadata");
    const exifSize = Buffer.alloc(4);
    exifSize.writeUInt32LE(exifPayload.length, 0);
    const padding = exifPayload.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
    chunks.push(Buffer.concat([Buffer.from("EXIF", "ascii"), exifSize, exifPayload, padding]));

    // XMP chunk
    const xmpPayload = Buffer.from("<x:xmpmeta>UserPersonalDetails</x:xmpmeta>");
    const xmpSize = Buffer.alloc(4);
    xmpSize.writeUInt32LE(xmpPayload.length, 0);
    const xmpPadding = xmpPayload.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
    chunks.push(Buffer.concat([Buffer.from("XMP ", "ascii"), xmpSize, xmpPayload, xmpPadding]));
  }

  // VP8 chunk (image bitstream)
  const vp8Payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const vp8Size = Buffer.alloc(4);
  vp8Size.writeUInt32LE(vp8Payload.length, 0);
  chunks.push(Buffer.concat([Buffer.from("VP8 ", "ascii"), vp8Size, vp8Payload]));

  // Rebuild RIFF header
  const totalSubChunks = Buffer.concat(chunks);
  const riffPayloadSize = 4 + totalSubChunks.length; // 'WEBP' (4) + chunks
  const riffHeader = Buffer.alloc(12);
  riffHeader.write("RIFF", 0, "ascii");
  riffHeader.writeUInt32LE(riffPayloadSize, 4);
  riffHeader.write("WEBP", 8, "ascii");

  return Buffer.concat([riffHeader, totalSubChunks]);
}

function createValidLossyWebpBuffer(width = 160, height = 120): Buffer {
  const payload = Buffer.alloc(10);
  payload[3] = 0x9d;
  payload[4] = 0x01;
  payload[5] = 0x2a;
  payload.writeUInt16LE(width, 6);
  payload.writeUInt16LE(height, 8);

  const vp8Header = Buffer.alloc(8);
  vp8Header.write("VP8 ", 0, "ascii");
  vp8Header.writeUInt32LE(10, 4);

  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + 8 + 10, 4);
  riff.write("WEBP", 8, "ascii");

  return Buffer.concat([riff, vp8Header, payload]);
}

function createValidLosslessWebpBuffer(width = 100, height = 80): Buffer {
  const w = width - 1;
  const h = height - 1;
  const b0 = w & 0xff;
  const b1 = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
  const b2 = (h >> 2) & 0xff;
  const b3 = (h >> 10) & 0x0f;

  const payload = Buffer.from([0x2f, b0, b1, b2, b3]);
  const vp8lHeader = Buffer.alloc(8);
  vp8lHeader.write("VP8L", 0, "ascii");
  vp8lHeader.writeUInt32LE(payload.length, 4);

  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + 8 + payload.length, 4);
  riff.write("WEBP", 8, "ascii");

  return Buffer.concat([riff, vp8lHeader, payload]);
}

describe("Avatar Guard - Magic Bytes, Boundaries & EXIF Stripping", () => {
  describe("Happy Path - Image Inspection", () => {
    it("should inspect a valid PNG and return dimensions", () => {
      const png = createValidPngBuffer(256, 128);
      const info = inspectImage(png);
      expect(info.format).toBe("png");
      expect(info.width).toBe(256);
      expect(info.height).toBe(128);
    });

    it("should inspect a valid JPEG and return dimensions", () => {
      const jpeg = createValidJpegBuffer(320, 240);
      const info = inspectImage(jpeg);
      expect(info.format).toBe("jpeg");
      expect(info.width).toBe(320);
      expect(info.height).toBe(240);
    });

    it("should inspect a valid WebP and return dimensions", () => {
      const webp = createValidWebpBuffer(400, 300);
      const info = inspectImage(webp);
      expect(info.format).toBe("webp");
      expect(info.width).toBe(400);
      expect(info.height).toBe(300);
    });

    it("should inspect simple lossy VP8 WebP without VP8X header", () => {
      const lossy = createValidLossyWebpBuffer(160, 120);
      const info = inspectImage(lossy);
      expect(info.format).toBe("webp");
      expect(info.width).toBe(160);
      expect(info.height).toBe(120);
    });

    it("should inspect simple lossless VP8L WebP", () => {
      const lossless = createValidLosslessWebpBuffer(100, 80);
      const info = inspectImage(lossless);
      expect(info.format).toBe("webp");
      expect(info.width).toBe(100);
      expect(info.height).toBe(80);
    });
  });

  describe("Boundary & Size Constraints", () => {
    it("should reject buffers smaller than 12 bytes", () => {
      expect(() => inspectImage(Buffer.from([0x89, 0x50]))).toThrow();
    });

    it("should reject images exceeding MAX_AVATAR_BYTES (5 MB)", () => {
      const oversized = Buffer.alloc(MAX_AVATAR_BYTES + 1);
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;
      expect(() => inspectImage(oversized)).toThrow();
    });

    it("should reject images with dimensions exceeding MAX_AVATAR_DIMENSION (decompression bomb protection)", () => {
      const hugePng = createValidPngBuffer(MAX_AVATAR_DIMENSION + 1, 100);
      expect(() => inspectImage(hugePng)).toThrow();

      const hugeJpeg = createValidJpegBuffer(100, MAX_AVATAR_DIMENSION + 1);
      expect(() => inspectImage(hugeJpeg)).toThrow();

      const hugeWebp = createValidWebpBuffer(MAX_AVATAR_DIMENSION + 1, 100);
      expect(() => inspectImage(hugeWebp)).toThrow();
    });
  });

  describe("Security Defenses - SVG, Scripts, Executables & Polyglots", () => {
    it("should strictly reject SVG uploads to prevent stored XSS", () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      expect(() => inspectImage(svg)).toThrow();
    });

    it("should reject HTML or text uploads disguised as images", () => {
      const html = Buffer.from("<html><body><h1>Fake Image</h1></body></html>");
      expect(() => inspectImage(html)).toThrow();
    });

    it("should reject executable files (MZ / ELF)", () => {
      const mz = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      expect(() => inspectImage(mz)).toThrow();

      const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      expect(() => inspectImage(elf)).toThrow();
    });
  });

  describe("EXIF & Metadata Stripping", () => {
    it("should strip EXIF and comment segments from JPEG", () => {
      const jpegWithExif = createValidJpegBuffer(150, 150, true);
      expect(jpegWithExif.includes(Buffer.from("Sensitive GPS"))).toBe(true);

      const stripped = stripImageMetadata(jpegWithExif);
      expect(stripped.format).toBe("jpeg");
      expect(stripped.buffer.includes(Buffer.from("Sensitive GPS"))).toBe(false);
      expect(stripped.buffer.includes(Buffer.from("Internal User Comment"))).toBe(false);

      // Verify the stripped image is still a valid JPEG
      const inspected = inspectImage(stripped.buffer);
      expect(inspected.format).toBe("jpeg");
      expect(inspected.width).toBe(150);
      expect(inspected.height).toBe(150);
    });

    it("should strip eXIf and tEXt chunks from PNG", () => {
      const pngWithExif = createValidPngBuffer(100, 100, true);
      expect(pngWithExif.includes(Buffer.from("Sensitive GPS"))).toBe(true);
      expect(pngWithExif.includes(Buffer.from("John Doe"))).toBe(true);

      const stripped = stripImageMetadata(pngWithExif);
      expect(stripped.format).toBe("png");
      expect(stripped.buffer.includes(Buffer.from("Sensitive GPS"))).toBe(false);
      expect(stripped.buffer.includes(Buffer.from("John Doe"))).toBe(false);

      // Verify the stripped PNG still has valid IHDR and can be inspected
      const inspected = inspectImage(stripped.buffer);
      expect(inspected.format).toBe("png");
      expect(inspected.width).toBe(100);
      expect(inspected.height).toBe(100);
    });

    it("should strip EXIF and XMP chunks from WebP and clear VP8X flags", () => {
      const webpWithExif = createValidWebpBuffer(200, 200, true);
      expect(webpWithExif.includes(Buffer.from("ExifDataGPS"))).toBe(true);
      expect(webpWithExif.includes(Buffer.from("UserPersonalDetails"))).toBe(true);

      const stripped = stripImageMetadata(webpWithExif);
      expect(stripped.format).toBe("webp");
      expect(stripped.buffer.includes(Buffer.from("ExifDataGPS"))).toBe(false);
      expect(stripped.buffer.includes(Buffer.from("UserPersonalDetails"))).toBe(false);

      // Verify the stripped WebP can still be inspected
      const inspected = inspectImage(stripped.buffer);
      expect(inspected.format).toBe("webp");
      expect(inspected.width).toBe(200);
      expect(inspected.height).toBe(200);
    });

    it("should strip metadata from simple lossy WebP without error", () => {
      const lossy = createValidLossyWebpBuffer(120, 90);
      const stripped = stripImageMetadata(lossy);
      expect(stripped.format).toBe("webp");
      const inspected = inspectImage(stripped.buffer);
      expect(inspected.width).toBe(120);
      expect(inspected.height).toBe(90);
    });

    it("should reject corrupted JPEG or WebP buffers with missing or truncated dimensions", () => {
      // JPEG without SOF (SOI immediately followed by standalone marker + padding > 12 bytes)
      const noSofJpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xd0, 0xff, 0xd9]),
        Buffer.alloc(10),
      ]);
      expect(() => inspectImage(noSofJpeg)).toThrow("Failed to parse JPEG dimensions");

      // JPEG with truncated SOF marker appearing after APP0 segment
      const truncatedSof = Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        Buffer.from([0xff, 0xe0, 0x00, 0x0c, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        Buffer.from([0xff, 0xc0, 0x00, 0x03]),
      ]);
      expect(() => inspectImage(truncatedSof)).toThrow("Corrupted JPEG SOF segment");

      // WebP without valid chunks
      const emptyWebp = Buffer.from("RIFF\x04\x00\x00\x00WEBP");
      expect(() => inspectImage(emptyWebp)).toThrow("Failed to parse WebP dimensions");
    });

    it("validateAndCleanAvatar executes end-to-end and returns cleaned buffer with contentType", () => {
      const raw = createValidJpegBuffer(180, 120, true);
      const clean = validateAndCleanAvatar(raw);
      expect(clean.contentType).toBe("image/jpeg");
      expect(clean.format).toBe("jpeg");
      expect(clean.width).toBe(180);
      expect(clean.height).toBe(120);
      expect(clean.buffer.includes(Buffer.from("Sensitive GPS"))).toBe(false);
    });
  });
});
