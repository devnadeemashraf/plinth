import type { Plan, PlanAudience } from "../domain/plan.ts";

export interface PlanRepository {
  list(filter: { audience?: PlanAudience }): Promise<Plan[]>;
  findByKey(key: string): Promise<Plan | undefined>;
}
