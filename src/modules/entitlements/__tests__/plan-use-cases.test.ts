import { describe, expect, it } from "vitest";
import { AppError } from "#platform/kernel/errors.ts";
import { getPlan } from "../application/get-plan.ts";
import { listPlans } from "../application/list-plans.ts";
import type { PlanRepository } from "../application/ports.ts";
import type { Plan, PlanAudience } from "../domain/plan.ts";

const plan = (key: string, sort: number, audience: PlanAudience = "user"): Plan => ({
  id: `id-${key}`,
  key,
  name: key.toUpperCase(),
  audience,
  isDefault: false,
  sort,
});

/** In-memory repository that returns plans in insertion order, filtered by audience. */
function fakeRepository(plans: Plan[]): PlanRepository & { filters: unknown[] } {
  const filters: unknown[] = [];
  return {
    filters,
    list(filter) {
      filters.push(filter);
      return Promise.resolve(
        plans.filter((p) => filter.audience === undefined || p.audience === filter.audience),
      );
    },
    findByKey: (key) => Promise.resolve(plans.find((p) => p.key === key)),
  };
}

describe("listPlans", () => {
  it("[P0-06 #2] Fake repository with plans (b, sort 2), (c, sort 1), (a, sort 1) → `listPlans` returns a, c, b", async () => {
    const planRepository = fakeRepository([plan("b", 2), plan("c", 1), plan("a", 1)]);

    const plans = await listPlans({ planRepository })({});

    expect(plans.map(({ key }) => key)).toEqual(["a", "c", "b"]);
  });

  it("passes the audience filter to the repository only when given", async () => {
    const planRepository = fakeRepository([plan("free", 0), plan("team", 1, "tenant")]);
    const list = listPlans({ planRepository });

    expect(await list({ audience: "tenant" })).toEqual([plan("team", 1, "tenant")]);
    await list({});
    expect(planRepository.filters).toEqual([{ audience: "tenant" }, {}]);
  });
});

describe("getPlan", () => {
  it("returns the plan with the key", async () => {
    const planRepository = fakeRepository([plan("free", 0)]);
    expect(await getPlan({ planRepository })({ key: "free" })).toEqual(plan("free", 0));
  });

  it("throws PLAN_NOT_FOUND for an unknown key", async () => {
    const planRepository = fakeRepository([]);
    const error = await getPlan({ planRepository })({ key: "pro" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).definition.code).toBe("PLAN_NOT_FOUND");
  });
});
