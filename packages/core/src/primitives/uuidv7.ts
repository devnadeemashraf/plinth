import { randomBytes } from "node:crypto";
import type { UuidV7 } from "@/primitives/brand-types.js";

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let lastTimestamp = -1;
let counter = 0;

/**
 * Generates an RFC 9562 compliant monotonic UUIDv7.
 * Enforces sub-millisecond monotonicity via a 12-bit counter and protects against
 * NTP clock regression by logically advancing the timestamp if time runs backwards.
 */
export function generateUuidV7(): UuidV7 {
  const now = Date.now();

  if (now <= lastTimestamp) {
    counter += 1;
    if (counter > 0x0fff) {
      // 12-bit counter overflow: advance logical timestamp to preserve monotonicity
      lastTimestamp += 1;
      counter = 0;
    }
  } else {
    lastTimestamp = now;
    counter = 0;
  }

  const bytes = Buffer.alloc(16);

  // 48-bit timestamp (ms since epoch)
  bytes.writeUIntBE(lastTimestamp, 0, 6);

  // 4-bit version (0x70) + high 4 bits of 12-bit counter
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  // low 8 bits of 12-bit counter
  bytes[7] = counter & 0xff;

  // 8 random bytes for entropy
  const rand = randomBytes(8);
  rand.copy(bytes, 8);

  // 2-bit variant (0x80) + high 6 bits of rand[0]
  const byte8 = bytes[8] ?? 0;
  bytes[8] = 0x80 | (byte8 & 0x3f);

  const hex = bytes.toString("hex");
  const formatted = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return formatted as UuidV7;
}

/**
 * Validates whether a value is a canonically formatted RFC 9562 UUIDv7 string.
 */
export function isUuidV7(val: unknown): val is UuidV7 {
  if (typeof val !== "string") {
    return false;
  }
  return UUID_V7_REGEX.test(val);
}

/**
 * Extracts the UTC Date embedded in an RFC 9562 UUIDv7 string.
 * Throws if the input is not a valid UUIDv7.
 */
export function extractUuidV7Timestamp(uuid: string): Date {
  if (!isUuidV7(uuid)) {
    throw new Error(`Invalid RFC 9562 UUIDv7 string: ${uuid}`);
  }

  const cleanHex = uuid.replace(/-/g, "");
  const timeHex = cleanHex.slice(0, 12);
  const ms = Number.parseInt(timeHex, 16);
  return new Date(ms);
}
