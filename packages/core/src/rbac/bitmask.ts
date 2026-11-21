import { BadRequestError } from "@/errors/app-error.js";
import { err, ok, type Result } from "@/primitives/result.js";

/**
 * Returns a canonical lowercase hex string prefixed with '0x' representing the BigInt bitmask.
 * @throws {RangeError} if mask is negative.
 */
export function toCanonicalHex(mask: bigint): string {
  if (mask < 0n) {
    throw new RangeError("Bitmask cannot be negative");
  }
  return `0x${mask.toString(16)}`;
}

/**
 * Parses a canonical hex string into a BigInt.
 * Validates that the input matches ^0x[0-9a-fA-F]+$ and is non-negative.
 */
export function fromCanonicalHex(hex: string): Result<bigint, BadRequestError> {
  if (typeof hex !== "string") {
    return err(
      new BadRequestError("Invalid bitmask hex: expected string", {
        code: "INVALID_BITMASK_HEX",
      }),
    );
  }

  const trimmed = hex.trim();
  if (!/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
    return err(
      new BadRequestError(`Invalid canonical bitmask hex format: '${hex}'`, {
        code: "INVALID_BITMASK_HEX",
      }),
    );
  }

  return ok(BigInt(trimmed));
}

/**
 * Calculates 1n << BigInt(position) for a given bit index.
 * Supports arbitrary bit width (e.g. 0..256+).
 * @throws {RangeError} if position is negative.
 */
export function bitFromPosition(position: number | bigint): bigint {
  const pos = BigInt(position);
  if (pos < 0n) {
    throw new RangeError("Bit position cannot be negative");
  }
  return 1n << pos;
}

/**
 * Checks whether `mask` has a specific bit set.
 */
export function hasBit(mask: bigint, bit: bigint): boolean {
  return (mask & bit) === bit;
}

/**
 * Checks whether `mask` has all bits in `required` set.
 */
export function hasAllBits(mask: bigint, required: bigint): boolean {
  return (mask & required) === required;
}

/**
 * Checks whether `mask` has at least one bit from `bits` set.
 */
export function hasAnyBit(mask: bigint, bits: bigint): boolean {
  return (mask & bits) !== 0n;
}

/**
 * Adds bits to mask (bitwise OR).
 */
export function addBits(mask: bigint, bits: bigint): bigint {
  return mask | bits;
}

/**
 * Removes bits from mask (bitwise AND NOT).
 */
export function removeBits(mask: bigint, bits: bigint): bigint {
  return mask & ~bits;
}

/**
 * Checks whether `subset` permissions are fully contained within `superset`.
 * Mathematically: (subset & ~superset) === 0n.
 */
export function isSubset(subset: bigint, superset: bigint): boolean {
  return (subset & ~superset) === 0n;
}

/**
 * Combines an iterable of bitmasks into a single bitwise OR mask.
 */
export function combineBitmasks(masks: Iterable<bigint>): bigint {
  let combined = 0n;
  for (const m of masks) {
    combined |= m;
  }
  return combined;
}
