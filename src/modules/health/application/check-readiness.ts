import { AppError, platformErrors } from "#platform/kernel/errors.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import type { ReadinessCheck } from "#platform/kernel/readiness.ts";

export interface Readiness {
  readonly ready: boolean;
  readonly passing: readonly string[];
  readonly failing: readonly string[];
}

export interface CheckReadinessDeps {
  readonly readinessChecks: readonly ReadinessCheck[];
  readonly logger: Logger;
  /** How long one check may take before it counts as failing. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;

function withTimeout(check: ReadinessCheck, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(platformErrors.UNAVAILABLE, {
          message: `${check.name} took over ${timeoutMs} ms`,
        }),
      );
    }, timeoutMs);
  });
  return Promise.race([check.check(), timeout]).finally(() => clearTimeout(timer));
}

/** Runs every readiness check in parallel; a check that rejects or exceeds the timeout fails. */
export function checkReadiness({
  readinessChecks,
  logger,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: CheckReadinessDeps) {
  return async (): Promise<Readiness> => {
    const outcomes = await Promise.all(
      readinessChecks.map((check) =>
        withTimeout(check, timeoutMs).then(
          () => ({ name: check.name, passed: true }),
          (error: unknown) => {
            logger.warn({ check: check.name, err: error }, "readiness check failed");
            return { name: check.name, passed: false };
          },
        ),
      ),
    );
    const failing = outcomes.filter((outcome) => !outcome.passed).map(({ name }) => name);
    const passing = outcomes.filter((outcome) => outcome.passed).map(({ name }) => name);
    return { ready: failing.length === 0, passing, failing };
  };
}
