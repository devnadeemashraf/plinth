/** Who a plan is for: a single user, or a whole tenant. */
export type PlanAudience = "user" | "tenant";

/** A named bundle of entitlements (SPEC §6.5). `key` is the stable public identifier. */
export interface Plan {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly audience: PlanAudience;
  /** The plan new subjects of this audience get; at most one per audience. */
  readonly isDefault: boolean;
  /** Display order, ascending. */
  readonly sort: number;
}
