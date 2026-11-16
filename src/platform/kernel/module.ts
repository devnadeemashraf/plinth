import type { AwilixContainer } from "awilix";
import type { Config } from "#platform/config/schema.ts";
import type { Cradle } from "#platform/di/cradle.ts";
import type { RouteDefinition } from "./http.ts";
import type { ReadinessCheck } from "./readiness.ts";

export type { ReadinessCheck } from "./readiness.ts";

/** A module's manifest, listed in `src/modules/index.ts`. */
export interface ModuleManifest {
  readonly name: string;
  register(container: AwilixContainer<Cradle>, config: Config): void;
  routes(container: AwilixContainer<Cradle>): RouteDefinition[];
  readiness?(container: AwilixContainer<Cradle>): ReadinessCheck[];
}
