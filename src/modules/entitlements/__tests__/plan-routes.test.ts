import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "../../../../test/support/http.ts";
import { getPlan } from "../application/get-plan.ts";
import { listPlans } from "../application/list-plans.ts";
import type { PlanRepository } from "../application/ports.ts";
import type { Plan } from "../domain/plan.ts";
import { planRoutes } from "../http/routes.ts";

const userPlans: Plan[] = [
  { id: "id-free", key: "free", name: "Free", audience: "user", isDefault: true, sort: 0 },
  { id: "id-pro", key: "pro", name: "Pro", audience: "user", isDefault: false, sort: 1 },
];

const planRepository: PlanRepository = {
  list: (filter) =>
    Promise.resolve(
      userPlans.filter((p) => filter.audience === undefined || p.audience === filter.audience),
    ),
  findByKey: (key) => Promise.resolve(userPlans.find((p) => p.key === key)),
};

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(
    planRoutes({ listPlans: listPlans({ planRepository }), getPlan: getPlan({ planRepository }) }),
  );
});

afterAll(async () => {
  await server.close();
});

const get = (path: string) => fetch(`${server.url}${path}`);

describe("plan routes", () => {
  it("[P0-06 #3] `?audience=tenant` with only user plans → 200 `data: []`", async () => {
    const response = await get("/v1/plans?audience=tenant");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [], nextCursor: null });
  });

  it("[P0-06 #4] `?audience=admin` → 400 VALIDATION_FAILED with path `audience`", async () => {
    const response = await get("/v1/plans?audience=admin");
    expect(response.status).toBe(400);
    const problem = (await response.json()) as { code: string; errors: { path: string }[] };
    expect(problem.code).toBe("VALIDATION_FAILED");
    expect(problem.errors.map(({ path }) => path)).toEqual(["query.audience"]);
  });

  it("[P0-06 #5] GET `/v1/plans/FREE` → 400 VALIDATION_FAILED", async () => {
    const response = await get("/v1/plans/FREE");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("VALIDATION_FAILED");
  });

  it("[P0-06 #6] Key of 40 valid chars that does not exist → 404 PLAN_NOT_FOUND; 41 chars → 400", async () => {
    const forty = `p${"a".repeat(39)}`;
    const missing = await get(`/v1/plans/${forty}`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe("PLAN_NOT_FOUND");

    const tooLong = await get(`/v1/plans/${forty}a`);
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { code: string }).code).toBe("VALIDATION_FAILED");
  });

  it("[P0-06 #8] Any plan response → has no `id`, `created_at` or `updated_at`", async () => {
    const list = (await (await get("/v1/plans")).json()) as { data: Record<string, unknown>[] };
    const one = (await (await get("/v1/plans/pro")).json()) as Record<string, unknown>;

    expect(list.data).toHaveLength(2);
    for (const body of [...list.data, one]) {
      expect(Object.keys(body).sort()).toEqual(["audience", "isDefault", "key", "name", "sort"]);
      for (const field of ["id", "created_at", "updated_at", "createdAt", "updatedAt"]) {
        expect(body).not.toHaveProperty(field);
      }
    }
  });

  it("answers both routes with `cache-control: public, max-age=60`", async () => {
    for (const path of ["/v1/plans", "/v1/plans/free"]) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    }
  });
});
