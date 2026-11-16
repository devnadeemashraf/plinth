import { asFunction } from "awilix";
import { describe, expect, it } from "vitest";
import { loadConfig } from "#platform/config/load.ts";
import type { ModuleManifest } from "#platform/kernel/module.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import { createRequestScope, createRootContainer, registerModules } from "../container.ts";
import { createTestContainer } from "../test-container.ts";

const silent: Logger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => silent,
};

describe("DI container", () => {
  it("resolves the platform services from the root", () => {
    const config = loadConfig({});
    const { cradle } = createRootContainer(config, silent);
    expect(cradle.config).toBe(config);
    expect(cradle.logger).toBe(silent);
    expect(cradle.idGenerator.next()).toMatch(/^[0-9a-f-]{36}$/);
    expect(cradle.clock.now()).toBeInstanceOf(Date);
    expect(cradle.readinessChecks).toEqual([]);
  });

  it("a request scope overrides values for that scope only", () => {
    const root = createRootContainer(loadConfig({}), silent);
    const scoped: Logger = { ...silent };
    const scope = createRequestScope(root, { logger: scoped });
    expect(scope.cradle.logger).toBe(scoped);
    expect(root.cradle.logger).toBe(silent);
  });

  it("refuses a singleton registered on a request scope (strict mode)", () => {
    const scope = createRequestScope(createRootContainer(loadConfig({}), silent), {});
    expect(() => scope.register("thing", asFunction(() => 1).singleton())).toThrow();
  });

  it("registers modules, collects readiness checks and returns their routes in order", () => {
    const config = loadConfig({});
    const container = createRootContainer(config, silent);
    const calls: string[] = [];
    const check = { name: "db", check: () => Promise.resolve() };
    const withChecks: ModuleManifest = {
      name: "a",
      register: (_container, received) => {
        calls.push(`register a ${received === config}`);
      },
      routes: () => [],
      readiness: () => [check],
    };
    const withoutChecks: ModuleManifest = {
      name: "b",
      register: () => {
        calls.push("register b");
      },
      routes: (received) => {
        calls.push(`routes b ${received.cradle.readinessChecks.length}`);
        return [];
      },
    };
    expect(registerModules(container, config, [withChecks, withoutChecks])).toEqual([]);
    expect(calls).toEqual(["register a true", "register b", "routes b 1"]);
    expect(container.cradle.readinessChecks).toEqual([check]);
  });

  it("createTestContainer applies overrides on top of test config", () => {
    const container = createTestContainer({ overrides: { logger: silent } });
    expect(container.cradle.logger).toBe(silent);
    expect(container.cradle.config.NODE_ENV).toBe("test");
    expect(createTestContainer().cradle.readinessChecks).toEqual([]);
  });
});
