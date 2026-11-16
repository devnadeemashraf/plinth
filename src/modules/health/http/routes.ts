import type { RouteDefinition } from "#platform/kernel/http.ts";
import type { Readiness } from "../application/check-readiness.ts";
import { livenessSchema, readySchema, unreadySchema } from "./schemas.ts";

export interface HealthRoutesDeps {
  readonly checkReadiness: () => Promise<Readiness>;
}

/** `/livez` and `/readyz`: public, outside `/v1`, for orchestrators and load balancers. */
export function healthRoutes({ checkReadiness }: HealthRoutesDeps): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/livez",
      summary: "Liveness",
      description: "Answers 200 while the process can serve requests. Checks no dependency.",
      tags: ["health"],
      auth: "public",
      request: {},
      responses: {
        200: { schema: livenessSchema, description: "Alive", example: { status: "ok" } },
      },
      errors: [],
      handler: () => Promise.resolve({ status: 200, body: { status: "ok" } }),
    },
    {
      method: "GET",
      path: "/readyz",
      summary: "Readiness",
      description:
        "Runs every module's readiness checks in parallel, each limited to 1 s. Answers 503 with the failing check names while any fails.",
      tags: ["health"],
      auth: "public",
      request: {},
      responses: {
        200: {
          schema: readySchema,
          description: "Every dependency is reachable",
          example: { status: "ready", checks: { database: "ok" } },
        },
        503: {
          schema: unreadySchema,
          description: "At least one dependency is unreachable",
          example: { status: "unready", failing: ["database"] },
        },
      },
      errors: [],
      async handler() {
        const readiness = await checkReadiness();
        if (!readiness.ready) {
          return {
            status: 503,
            headers: { "retry-after": "5" },
            body: { status: "unready", failing: readiness.failing },
          };
        }
        const checks = Object.fromEntries(readiness.passing.map((name) => [name, "ok"]));
        return { status: 200, body: { status: "ready", checks } };
      },
    },
  ];
}
