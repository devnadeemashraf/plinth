import type { Config } from "#platform/config/schema.ts";
import type { Clock } from "#platform/kernel/ports/clock.ts";
import type { IdGenerator } from "#platform/kernel/ports/id-generator.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import type { ReadinessCheck } from "#platform/kernel/readiness.ts";

/**
 * Everything the container resolves. Modules add their entries by declaration merging in their
 * manifest: `declare module "#platform/di/cradle.ts" { interface Cradle { … } }`.
 */
export interface Cradle {
  config: Config;
  logger: Logger;
  clock: Clock;
  idGenerator: IdGenerator;
  /** Every enabled module's readiness checks, collected by `registerModules`. */
  readinessChecks: readonly ReadinessCheck[];
}
