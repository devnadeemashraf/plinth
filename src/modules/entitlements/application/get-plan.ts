import { AppError } from "#platform/kernel/errors.ts";
import { entitlementsErrors } from "../domain/errors.ts";
import type { Plan } from "../domain/plan.ts";
import type { PlanRepository } from "./ports.ts";

export interface GetPlanDeps {
  readonly planRepository: PlanRepository;
}

export interface GetPlanInput {
  readonly key: string;
}

/** The plan with `key`; throws PLAN_NOT_FOUND when there is none. */
export function getPlan({ planRepository }: GetPlanDeps) {
  return async (input: GetPlanInput): Promise<Plan> => {
    const plan = await planRepository.findByKey(input.key);
    if (plan === undefined) {
      throw new AppError(entitlementsErrors.PLAN_NOT_FOUND);
    }
    return plan;
  };
}
