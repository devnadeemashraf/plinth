import { asc, eq } from "drizzle-orm";
import type { Database } from "#platform/db/client.ts";
import type { PlanRepository } from "../application/ports.ts";
import type { Plan, PlanAudience } from "../domain/plan.ts";
import { plans } from "./schema.ts";

const planColumns = {
  id: plans.id,
  key: plans.key,
  name: plans.name,
  audience: plans.audience,
  isDefault: plans.isDefault,
  sort: plans.sort,
};

export class DrizzlePlanRepository implements PlanRepository {
  readonly #database: Database;

  constructor({ database }: { database: Database }) {
    this.#database = database;
  }

  list(filter: { audience?: PlanAudience }): Promise<Plan[]> {
    return this.#database.db
      .select(planColumns)
      .from(plans)
      .where(filter.audience === undefined ? undefined : eq(plans.audience, filter.audience))
      .orderBy(asc(plans.sort), asc(plans.key));
  }

  async findByKey(key: string): Promise<Plan | undefined> {
    const [plan] = await this.#database.db
      .select(planColumns)
      .from(plans)
      .where(eq(plans.key, key))
      .limit(1);
    return plan;
  }
}
