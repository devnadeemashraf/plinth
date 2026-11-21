export {
  ConfigValidationError,
  loadConfig,
  type SanitizedConfigIssue,
} from "@/config/loader.js";
export {
  type AppConfig,
  envSchema,
} from "@/config/schema.js";
export {
  generateOpenApiSpec,
  type OpenApiDocument,
  type OpenApiInfo,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiPathItem,
} from "@/contracts/openapi.js";
export {
  type CursorPaginationQuery,
  type CursorPaginationResult,
  cursorPaginationQuerySchema,
  paginateArray,
} from "@/contracts/pagination.js";
export {
  defineRoute,
  type RouteContract,
  type ValidatedRequest,
  validateRequestInput,
} from "@/contracts/route.js";
export {
  AppError,
  type AppErrorOptions,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  type ProblemDetails,
  RateLimitExceededError,
  ServiceUnavailableError,
  type ToProblemDetailsOptions,
  toProblemDetails,
  UnauthorizedError,
  ValidationError,
  type ValidationErrorDetail,
} from "@/errors/index.js";
export {
  type ArchitecturalViolation,
  type ArchitectureScanReport,
  type FileScanResult,
  scanArchitecture,
  scanSourceText,
  stripCommentsPreservingStrings,
} from "@/fitness/scanner.js";
export {
  createLogger,
  type LogDestination,
  type LoggerOptions,
  type LoggerPort,
  type LogLevel,
} from "@/observability/logger.js";
export {
  createInMemoryMetrics,
  type HistogramData,
  InMemoryMetrics,
  type MetricsPort,
  type MetricsSnapshot,
} from "@/observability/metrics.js";
export {
  createInMemoryTracer,
  InMemoryTracer,
  type Span,
  type TraceContext,
  type TracingPort,
} from "@/observability/tracing.js";
export type { DatabasePort } from "@/ports/database.js";
export type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpRouteHandler,
  HttpServerPort,
} from "@/ports/http.js";
export {
  DefaultLifecycleManager,
  type LifecycleHook,
  type LifecyclePort,
} from "@/ports/lifecycle.js";
export type {
  Brand,
  IsoUtcTimestamp,
  RequestId,
  TenantId,
  UserId,
  UuidV7,
} from "@/primitives/brand-types.js";
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
} from "@/primitives/result.js";
export {
  extractUuidV7Timestamp,
  generateUuidV7,
  isUuidV7,
} from "@/primitives/uuidv7.js";
export {
  defaultRedactionEngine,
  RedactionEngine,
  type RedactionOptions,
} from "@/redaction/engine.js";
export {
  maskAadhaar,
  maskCreditCard,
  maskEmail,
  maskPan,
  maskPhone,
  maskToken,
} from "@/redaction/maskers.js";
export {
  isRedacted,
  Redacted,
  redacted,
} from "@/redaction/redacted.js";
