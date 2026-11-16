import { type AwilixContainer, asValue, createContainer, InjectionMode } from "awilix";
import type { Config } from "#platform/config/schema.ts";
import type { RouteDefinition } from "#platform/kernel/http.ts";
import type { ModuleManifest } from "#platform/kernel/module.ts";
import { systemClock } from "#platform/kernel/ports/clock.ts";
import { uuidV7Generator } from "#platform/kernel/ports/id-generator.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import type { Cradle } from "./cradle.ts";

/** The process-wide container with the platform services registered. */
export function createRootContainer(config: Config, logger: Logger): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    logger: asValue(logger),
    clock: asValue(systemClock),
    idGenerator: asValue(uuidV7Generator),
    readinessChecks: asValue([]),
  });
  return container;
}

/** A child scope for one request or job; `values` replace entries for that scope only. */
export function createRequestScope(
  root: AwilixContainer<Cradle>,
  values: Partial<Cradle>,
): AwilixContainer<Cradle> {
  const scope = root.createScope();
  for (const [name, value] of Object.entries(values)) {
    scope.register(name, asValue(value));
  }
  return scope;
}

/** Registers each module, collects their readiness checks and returns all their routes. */
export function registerModules(
  container: AwilixContainer<Cradle>,
  config: Config,
  modules: readonly ModuleManifest[],
): RouteDefinition[] {
  for (const module of modules) {
    module.register(container, config);
  }
  container.register({
    readinessChecks: asValue(modules.flatMap((module) => module.readiness?.(container) ?? [])),
  });
  return modules.flatMap((module) => module.routes(container));
}
