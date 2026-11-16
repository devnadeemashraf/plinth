import { asClass, asFunction } from "awilix";
import type { ModuleManifest } from "#platform/kernel/module.ts";
import { getPlan } from "./application/get-plan.ts";
import { listPlans } from "./application/list-plans.ts";
import type { PlanRepository } from "./application/ports.ts";
import { planRoutes } from "./http/routes.ts";
import { DrizzlePlanRepository } from "./infra/drizzle-plan-repository.ts";

declare module "#platform/di/cradle.ts" {
  interface Cradle {
    planRepository: PlanRepository;
    listPlans: ReturnType<typeof listPlans>;
    getPlan: ReturnType<typeof getPlan>;
  }
}

/** Plans, and from later items their entitlements, assignments and overrides (SPEC §6.5). */
export const entitlementsModule: ModuleManifest = {
  name: "entitlements",
  register(container) {
    container.register({
      planRepository: asClass(DrizzlePlanRepository).singleton(),
      listPlans: asFunction(listPlans).singleton(),
      getPlan: asFunction(getPlan).singleton(),
    });
  },
  routes(container) {
    const { listPlans, getPlan } = container.cradle;
    return planRoutes({ listPlans, getPlan });
  },
};
