import type { RouteContract } from "@/contracts/route.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly params: Record<string, string | undefined>;
  readonly query: Record<string, string | string[] | undefined>;
  readonly body?: unknown;
  readonly traceId?: string | undefined;
  readonly ip?: string | undefined;
  readonly raw?: unknown;
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers?: Record<string, string | number> | undefined;
  readonly body?: unknown;
}

export type HttpRouteHandler = (req: HttpRequest) => Promise<HttpResponse> | HttpResponse;

export interface HttpServerPort {
  registerRoute(contract: RouteContract, handler: HttpRouteHandler): void;
  listen(port: number, host?: string): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
  getUnderlyingApp(): unknown;
}
