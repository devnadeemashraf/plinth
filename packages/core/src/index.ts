export {
  ConfigValidationError,
  loadConfig,
  type SanitizedConfigIssue,
} from "./config/loader.js";
export {
  type AppConfig,
  envSchema,
} from "./config/schema.js";
export {
  type ArchitecturalViolation,
  type ArchitectureScanReport,
  type FileScanResult,
  scanArchitecture,
  scanSourceText,
  stripCommentsPreservingStrings,
} from "./fitness/scanner.js";
export type {
  Brand,
  IsoUtcTimestamp,
  RequestId,
  TenantId,
  UserId,
  UuidV7,
} from "./primitives/brand-types.js";
export {
  type Err,
  err,
  flatMap,
  isErr,
  isOk,
  map,
  type Ok,
  ok,
  type Result,
  unwrapOr,
} from "./primitives/result.js";
export {
  extractUuidV7Timestamp,
  generateUuidV7,
  isUuidV7,
} from "./primitives/uuidv7.js";
