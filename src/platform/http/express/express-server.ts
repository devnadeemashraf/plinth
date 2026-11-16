import { createServer, type IncomingHttpHeaders } from "node:http";
import express, { type Request, type Response } from "express";
import type { Config } from "#platform/config/schema.ts";
import { AppError, platformErrors } from "#platform/kernel/errors.ts";
import type { HttpServerPort, RouteDefinition } from "#platform/kernel/http.ts";
import { assertSupported, type NeutralRequest, notFoundRoute, type Pipeline } from "../pipeline.ts";

export interface ExpressServerDeps {
  readonly config: Pick<Config, "BODY_LIMIT_BYTES" | "TRUST_PROXY">;
  readonly pipeline: Pipeline;
  /** How long `close()` waits for in-flight requests before cutting connections. */
  readonly shutdownGraceMs?: number;
}

const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;

const toExpressPath = (path: string): string => path.replaceAll(/\{(\w+)\}/g, ":$1");

function neutralHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[name] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  return result;
}

/** Translates a body-parser failure; anything that is not a client error stays internal. */
function bodyError(error: unknown): AppError {
  const { type, status } = error as { type?: unknown; status?: unknown };
  if (type === "entity.too.large") {
    return new AppError(platformErrors.PAYLOAD_TOO_LARGE, { cause: error });
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    return new AppError(platformErrors.VALIDATION_FAILED, {
      message: "The request body could not be read",
      cause: error,
    });
  }
  return new AppError(platformErrors.INTERNAL, { cause: error });
}

/** `HttpServerPort` on Express 5. Express only routes and parses; the pipeline does the rest. */
export function createExpressHttpServer(deps: ExpressServerDeps): HttpServerPort {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  app.set("trust proxy", deps.config.TRUST_PROXY);
  const parseJson = express.json({ limit: deps.config.BODY_LIMIT_BYTES });
  const server = createServer(app);
  const graceMs = deps.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
  let fallbackInstalled = false;
  let closing = false;

  async function dispatch(
    req: Request,
    res: Response,
    route: RouteDefinition,
    error?: AppError,
  ): Promise<void> {
    const request: NeutralRequest = {
      method: req.method,
      path: req.path,
      headers: neutralHeaders(req.headers),
      params: Object.fromEntries(
        Object.entries(req.params).map(([name, value]) => [name, String(value)]),
      ),
      query: req.query,
      body: req.body,
      ip: req.ip ?? "",
      ...(error ? { bodyError: error } : {}),
    };
    const response = await deps.pipeline.handle(request, route);
    res.status(response.status);
    for (const [name, value] of Object.entries(response.headers)) {
      res.setHeader(name, value);
    }
    if (closing) {
      // Otherwise an idle keep-alive connection holds shutdown open until it times out.
      res.setHeader("connection", "close");
    }
    res.end(response.body === undefined ? undefined : JSON.stringify(response.body));
  }

  function installFallback(): void {
    if (!fallbackInstalled) {
      app.use((req, res) => dispatch(req, res, notFoundRoute));
      fallbackInstalled = true;
    }
  }

  return {
    register(routes) {
      if (fallbackInstalled) {
        throw new Error("Routes must be registered before listen()");
      }
      for (const route of routes) {
        assertSupported(route);
        const method = route.method.toLowerCase() as Lowercase<RouteDefinition["method"]>;
        app[method](toExpressPath(route.path), async (req, res) => {
          const error = await new Promise<unknown>((resolve) => parseJson(req, res, resolve));
          await dispatch(req, res, route, error === undefined ? undefined : bodyError(error));
        });
      }
    },

    listen(port) {
      installFallback();
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },

    close() {
      closing = true;
      return new Promise((resolve, reject) => {
        const cutoff = setTimeout(() => server.closeAllConnections(), graceMs);
        cutoff.unref();
        server.close((error) => {
          clearTimeout(cutoff);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        server.closeIdleConnections();
      });
    },

    nodeServer: () => server,
  };
}
