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
  generateOpenApiSpec,
  type OpenApiDocument,
  type OpenApiInfo,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiPathItem,
} from "./contracts/openapi.js";
export {
  type CursorPaginationQuery,
  type CursorPaginationResult,
  cursorPaginationQuerySchema,
  paginateArray,
} from "./contracts/pagination.js";
export {
  defineRoute,
  type RouteContract,
  type ValidatedRequest,
  validateRequestInput,
} from "./contracts/route.js";
export * from "./crypto/index.js";
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
} from "./errors/index.js";
export {
  type ArchitecturalViolation,
  type ArchitectureScanReport,
  type FileScanResult,
  scanArchitecture,
  scanSourceText,
  stripCommentsPreservingStrings,
} from "./fitness/scanner.js";
export {
  createLogger,
  type LogDestination,
  type LoggerOptions,
  type LoggerPort,
  type LogLevel,
} from "./observability/logger.js";
export {
  createInMemoryMetrics,
  type HistogramData,
  InMemoryMetrics,
  type MetricsPort,
  type MetricsSnapshot,
} from "./observability/metrics.js";
export {
  createInMemoryTracer,
  InMemoryTracer,
  type Span,
  type TraceContext,
  type TracingPort,
} from "./observability/tracing.js";
export {
  CacheCircuitBreaker,
  type CacheCircuitBreakerOptions,
  type CachePort,
  type CacheStats,
  type CircuitBreakerState,
} from "./ports/cache.js";
export type { DatabasePort } from "./ports/database.js";
export {
  type EmailAddress,
  type EmailPort,
  type EmailRecipient,
  normalizeEmailAddress,
  type SendEmailInput,
  type SendEmailResult,
  validateEmailSubject,
} from "./ports/email.js";
export type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpRouteHandler,
  HttpServerPort,
} from "./ports/http.js";
export {
  DefaultLifecycleManager,
  type LifecycleHook,
  type LifecyclePort,
} from "./ports/lifecycle.js";
export {
  type CreateOutboxEventInput,
  calculateNextRetryTime,
  type EnqueueJobInput,
  type JobHandler,
  type JobStatus,
  type OutboxEvent,
  type OutboxRepositoryPort,
  type QueuePort,
} from "./ports/queue.js";
export {
  DefaultSseBroadcaster,
  type DefaultSseBroadcasterOptions,
  formatSseEvent,
  type SseBroadcasterPort,
  type SseClient,
  type SseEvent,
} from "./ports/sse.js";
export type {
  Brand,
  IsoUtcTimestamp,
  RequestId,
  RoleId,
  TenantId,
  UserId,
  UuidV7,
} from "./primitives/brand-types.js";
export {
  createRoleId,
  createUserId,
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
export {
  type ActorRankContext,
  ADMINISTRATOR_BIT,
  addBits,
  assertCanManageRole,
  bitFromPosition,
  CORE_PERMISSIONS,
  type CorePermissionName,
  canManageRole,
  combineBitmasks,
  defaultPermissionRegistry,
  type EvaluatePermissionsParams,
  evaluateEffectivePermissions,
  fromCanonicalHex,
  hasAllBits,
  hasAnyBit,
  hasAnyPermission,
  hasBit,
  hasPermission,
  isSubset,
  MAX_ROLE_METADATA_BYTES,
  MAX_SCOPE_DEPTH,
  type OverwriteInput,
  type OverwriteType,
  type PermissionDefinition,
  PermissionRegistry,
  type ProposedRoleMutation,
  type RoleInput,
  type RoleMetadata,
  removeBits,
  roleMetadataSchema,
  type ScopeLevel,
  type TargetRoleData,
  toCanonicalHex,
  validateRoleMetadata,
} from "./rbac/index.js";
export {
  defaultRedactionEngine,
  RedactionEngine,
  type RedactionOptions,
} from "./redaction/engine.js";
export {
  maskAadhaar,
  maskCreditCard,
  maskEmail,
  maskPan,
  maskPhone,
  maskToken,
} from "./redaction/maskers.js";
export {
  isRedacted,
  Redacted,
  redacted,
} from "./redaction/redacted.js";
export {
  getSecurityHeaders,
  type SecurityHeaderOptions,
} from "./security/headers.js";
export {
  computeRequestHash,
  type IdempotencyBeginResult,
  type IdempotencyOptions,
  type IdempotencyResponse,
  InMemoryIdempotencyManager,
} from "./security/idempotency.js";
export {
  InMemoryRateLimiter,
  type RateLimiterOptions,
  type RateLimitResult,
} from "./security/rate-limiter.js";
export {
  isIpBlocked,
  SsrfBlockedError,
  type SsrfValidationOptions,
  type SsrfValidationResult,
  validateUrlForEgress,
} from "./security/ssrf-guard.js";
export {
  createTenantId,
  DEFAULT_TENANT_CONTEXT,
  DEFAULT_TENANT_ID,
  getTenantContext,
  requireTenantContext,
  runWithTenantContext,
  type TenantContext,
  type TenantQuota,
} from "./tenancy/context.js";
export {
  assertTenantContext,
  withTenantGuard,
} from "./tenancy/guard.js";
export {
  resolveTenantFromRequest,
  type TenantResolutionStrategy,
  type TenantResolverOptions,
} from "./tenancy/resolver.js";
