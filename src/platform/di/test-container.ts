import { type AwilixContainer, asValue } from "awilix";
import { loadConfig } from "#platform/config/load.ts";
import { createLogger } from "#platform/logger/create-logger.ts";
import { createRootContainer } from "./container.ts";
import type { Cradle } from "./cradle.ts";

export interface TestContainerOptions {
  /** Entries that replace the defaults, typically in-memory fakes. */
  readonly overrides?: Partial<Cradle>;
}

/** A root container for tests: test config, a logger that writes only fatal lines, plus overrides. */
export function createTestContainer(options: TestContainerOptions = {}): AwilixContainer<Cradle> {
  const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "fatal" });
  const container = createRootContainer(config, createLogger(config));
  for (const [name, value] of Object.entries(options.overrides ?? {})) {
    container.register(name, asValue(value));
  }
  return container;
}
