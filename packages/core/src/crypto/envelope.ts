import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { BadRequestError } from "@/errors/index.js";

const ENVELOPE_PREFIX = "enc:v1:";
const AES_256_GCM = "aes-256-gcm";
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12; // 96 bits for GCM
const AUTH_TAG_BYTES = 16; // 128 bits for GCM
const MIN_DISTINCT_KEY_BYTES = 16;

/**
 * Validates that the provided Master Key has exactly 32 bytes and sufficient entropy.
 * Rejects all-zero keys, repeating single bytes, or keys with fewer than 16 distinct bytes.
 */
export function validateMasterKeyEntropy(masterKey: Buffer | Uint8Array): void {
  if (!masterKey || masterKey.length !== KEY_BYTES) {
    throw new BadRequestError(`Master encryption key must be exactly ${KEY_BYTES} bytes.`, {
      code: "INVALID_MASTER_KEY_LENGTH",
    });
  }

  const distinct = new Set<number>(masterKey);
  if (distinct.size < MIN_DISTINCT_KEY_BYTES) {
    throw new BadRequestError(
      `Master encryption key has insufficient entropy (fewer than ${MIN_DISTINCT_KEY_BYTES} distinct bytes).`,
      { code: "LOW_ENTROPY_MASTER_KEY" },
    );
  }
}

interface EnvelopePayload {
  readonly v: 1;
  readonly edek: string; // Encrypted Data Encryption Key (base64url)
  readonly dekIv: string; // IV used to encrypt DEK (base64url)
  readonly dekTag: string; // Auth tag for DEK (base64url)
  readonly iv: string; // IV used to encrypt data (base64url)
  readonly tag: string; // Auth tag for data (base64url)
  readonly ct: string; // Ciphertext (base64url)
}

/**
 * Encrypts plaintext using AES-256-GCM envelope encryption.
 * A fresh 256-bit DEK and 96-bit IV are generated per call.
 * The DEK is encrypted by the provided Master Key (KEK) using AES-256-GCM.
 * Returns a serialized string prefixed with `enc:v1:`.
 */
export function encryptEnvelope(
  plaintext: string | Buffer | Uint8Array,
  masterKey: Buffer | Uint8Array,
): string {
  validateMasterKeyEntropy(masterKey);

  const plaintextBuf =
    typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : Buffer.from(plaintext);

  // 1. Generate fresh DEK and IV for data
  const dek = randomBytes(KEY_BYTES);
  const dataIv = randomBytes(IV_BYTES);

  // 2. Encrypt plaintext with DEK
  const dataCipher = createCipheriv(AES_256_GCM, dek, dataIv);
  const dataCt = Buffer.concat([dataCipher.update(plaintextBuf), dataCipher.final()]);
  const dataTag = dataCipher.getAuthTag();

  // 3. Encrypt DEK with Master Key
  const dekIv = randomBytes(IV_BYTES);
  const dekCipher = createCipheriv(AES_256_GCM, masterKey, dekIv);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  // Zeroize sensitive local buffer in memory
  dek.fill(0);

  const payload: EnvelopePayload = {
    v: 1,
    edek: encryptedDek.toString("base64url"),
    dekIv: dekIv.toString("base64url"),
    dekTag: dekTag.toString("base64url"),
    iv: dataIv.toString("base64url"),
    tag: dataTag.toString("base64url"),
    ct: dataCt.toString("base64url"),
  };

  const serialized = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${ENVELOPE_PREFIX}${serialized}`;
}

/**
 * Decrypts a serialized AES-256-GCM envelope string using the Master Key.
 * Throws AppError if the envelope is malformed, auth tags fail, or the key is wrong.
 */
export function decryptEnvelope(envelopeString: string, masterKey: Buffer | Uint8Array): Buffer {
  validateMasterKeyEntropy(masterKey);

  if (!envelopeString?.startsWith(ENVELOPE_PREFIX)) {
    throw new BadRequestError("Provided value is not a valid encrypted envelope.", {
      code: "INVALID_ENVELOPE_FORMAT",
    });
  }

  const encodedPayload = envelopeString.slice(ENVELOPE_PREFIX.length);
  let payload: EnvelopePayload;
  try {
    const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf8");
    payload = JSON.parse(jsonStr) as EnvelopePayload;
  } catch {
    throw new BadRequestError("Encrypted envelope payload is corrupted or malformed.", {
      code: "CORRUPTED_ENVELOPE",
    });
  }

  if (
    payload.v !== 1 ||
    typeof payload.edek !== "string" ||
    typeof payload.ct !== "string" ||
    typeof payload.tag !== "string" ||
    typeof payload.iv !== "string" ||
    typeof payload.dekIv !== "string" ||
    typeof payload.dekTag !== "string"
  ) {
    throw new BadRequestError("Unsupported envelope version or missing fields.", {
      code: "UNSUPPORTED_ENVELOPE_VERSION",
    });
  }

  let dek: Buffer | null = null;
  try {
    const encryptedDek = Buffer.from(payload.edek, "base64url");
    const dekIv = Buffer.from(payload.dekIv, "base64url");
    const dekTag = Buffer.from(payload.dekTag, "base64url");

    if (dekTag.length !== AUTH_TAG_BYTES) {
      throw new Error("Invalid DEK auth tag length");
    }

    const dekDecipher = createDecipheriv(AES_256_GCM, masterKey, dekIv);
    dekDecipher.setAuthTag(dekTag);
    dek = Buffer.concat([dekDecipher.update(encryptedDek), dekDecipher.final()]);

    const dataCt = Buffer.from(payload.ct, "base64url");
    const dataIv = Buffer.from(payload.iv, "base64url");
    const dataTag = Buffer.from(payload.tag, "base64url");

    if (dataTag.length !== AUTH_TAG_BYTES) {
      throw new Error("Invalid data auth tag length");
    }

    const dataDecipher = createDecipheriv(AES_256_GCM, dek, dataIv);
    dataDecipher.setAuthTag(dataTag);
    const plaintext = Buffer.concat([dataDecipher.update(dataCt), dataDecipher.final()]);

    return plaintext;
  } catch {
    throw new BadRequestError(
      "Envelope decryption failed. Check master key and envelope integrity.",
      { code: "DECRYPTION_FAILED" },
    );
  } finally {
    if (dek) {
      dek.fill(0);
    }
  }
}
