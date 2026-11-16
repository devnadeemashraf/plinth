import type { z } from "zod";
import { platformErrors } from "#platform/kernel/errors.ts";
import type { RouteDefinition } from "#platform/kernel/http.ts";
import type { GetPlanInput } from "../application/get-plan.ts";
import type { ListPlansInput } from "../application/list-plans.ts";
import { entitlementsErrors } from "../domain/errors.ts";
import type { Plan } from "../domain/plan.ts";
import { listPlansQuerySchema, planListSchema, planParamsSchema, planSchema } from "./schemas.ts";

export interface PlanRoutesDeps {
  readonly listPlans: (input: ListPlansInput) => Promise<Plan[]>;
  readonly getPlan: (input: GetPlanInput) => Promise<Plan>;
}

type PlanBody = z.infer<typeof planSchema>;

const CACHE_HEADERS = { "cache-control": "public, max-age=60" };

const freePlan: PlanBody = {
  key: "free",
  name: "Free",
  audience: "user",
  isDefault: true,
  sort: 0,
};

/** Picks the public fields, so the internal id and timestamps never leave the module. */
const toBody = ({ key, name, audience, isDefault, sort }: Plan): PlanBody => ({
  key,
  name,
  audience,
  isDefault,
  sort,
});

/** The public plan catalog: `GET /v1/plans` and `GET /v1/plans/{key}`. */
export function planRoutes({ listPlans, getPlan }: PlanRoutesDeps): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/v1/plans",
      summary: "List plans",
      description:
        "Lists the plans on offer, ordered by `sort`, then `key`. `audience` keeps only user or only tenant plans. Public; cacheable for 60 s.",
      tags: ["Plans"],
      auth: "public",
      request: { query: listPlansQuerySchema },
      responses: {
        200: {
          schema: planListSchema,
          description: "The plans; `nextCursor` is always null",
          example: { data: [freePlan], nextCursor: null },
        },
      },
      errors: [platformErrors.VALIDATION_FAILED],
      async handler(ctx) {
        const query = ctx.query as z.infer<typeof listPlansQuerySchema>;
        const plans = await listPlans(query);
        return {
          status: 200,
          headers: CACHE_HEADERS,
          body: { data: plans.map(toBody), nextCursor: null },
        };
      },
    },
    {
      method: "GET",
      path: "/v1/plans/{key}",
      summary: "Get a plan",
      description:
        "Returns one plan by key. A key is a lower-case letter followed by 1–39 lower-case letters, digits or underscores. Public; cacheable for 60 s.",
      tags: ["Plans"],
      auth: "public",
      request: { params: planParamsSchema },
      responses: {
        200: { schema: planSchema, description: "The plan", example: freePlan },
      },
      errors: [platformErrors.VALIDATION_FAILED, entitlementsErrors.PLAN_NOT_FOUND],
      async handler(ctx) {
        const { key } = ctx.params as z.infer<typeof planParamsSchema>;
        const plan = await getPlan({ key });
        return { status: 200, headers: CACHE_HEADERS, body: toBody(plan) };
      },
    },
  ];
}
