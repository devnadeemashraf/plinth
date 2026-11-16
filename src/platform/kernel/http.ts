import type { Server } from "node:http";
import type { AwilixContainer } from "awilix";
import type { ZodType } from "zod";
import type { Cradle } from "#platform/di/cradle.ts";
import type { ErrorDefinition } from "./errors.ts";
import type { EntitlementKey, FlagKey, PermissionKey } from "./keys.ts";
import type { Logger } from "./ports/logger.ts";

/** Rate limit for one route; enforced from E03. */
export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}

/** What a handler sees of the request. Handlers never see the framework's `req`/`res`. */
export interface RequestContext {
  readonly requestId: string;
  readonly logger: Logger;
  /** The request's DI scope. */
  readonly container: AwilixContainer<Cradle>;
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
  /** Lower-cased names; repeated headers joined with ", ". */
  readonly headers: Readonly<Record<string, string>>;
  readonly ip: string;
}

export interface HttpResult {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  tags: string[];
  auth: "public" | "session" | { permission: PermissionKey };
  entitlement?: EntitlementKey;
  flag?: FlagKey;
  activity?: "auto" | { none: string };
  rateLimit?: RateLimitPolicy;
  idempotent?: boolean;
  rawBody?: boolean;
  request: { params?: ZodType; query?: ZodType; body?: ZodType };
  responses: Record<number, { schema: ZodType; description: string; example: unknown }>;
  errors: ErrorDefinition[];
  handler(ctx: RequestContext): Promise<HttpResult>;
}

/** The HTTP framework behind the pipeline. Adapters: `#platform/http/express`. */
export interface HttpServerPort {
  register(routes: RouteDefinition[]): void;
  listen(port: number): Promise<void>;
  /** Stops accepting connections and resolves once in-flight requests finished. */
  close(): Promise<void>;
  nodeServer(): Server;
}
