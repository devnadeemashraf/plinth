import { defineErrors } from "#platform/kernel/errors.ts";

export const entitlementsErrors = defineErrors({
  PLAN_NOT_FOUND: { status: 404, title: "Plan not found" },
});
