import type { ModuleManifest } from "#platform/kernel/module.ts";
import { checkReadiness } from "./application/check-readiness.ts";
import { healthRoutes } from "./http/routes.ts";

export const healthModule: ModuleManifest = {
  name: "health",
  register() {},
  routes(container) {
    const { readinessChecks, logger } = container.cradle;
    return healthRoutes({ checkReadiness: checkReadiness({ readinessChecks, logger }) });
  },
};
