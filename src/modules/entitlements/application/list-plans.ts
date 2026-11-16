import type { Plan, PlanAudience } from "../domain/plan.ts";
import type { PlanRepository } from "./ports.ts";

export interface ListPlansDeps {
  readonly planRepository: PlanRepository;
}

export interface ListPlansInput {
  readonly audience?: PlanAudience | undefined;
}

/** Code-point order, so the result does not depend on the server's locale. */
const byKey = (a: Plan, b: Plan): number => Number(a.key > b.key) - Number(a.key < b.key);

/** Plans, optionally of one audience, ordered by `sort` ascending, then `key` ascending. */
export function listPlans({ planRepository }: ListPlansDeps) {
  return async (input: ListPlansInput): Promise<Plan[]> => {
    const plans = await planRepository.list(
      input.audience === undefined ? {} : { audience: input.audience },
    );
    return plans.toSorted((a, b) => a.sort - b.sort || byKey(a, b));
  };
}
