import { type DestinationStream, pino } from "pino";
import type { Config } from "#platform/config/schema.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";

const SENSITIVE_KEYS = [
  "password",
  "token",
  "refreshToken",
  "secret",
  "hash",
  "authorization",
  "cookie",
] as const;
const MAX_DEPTH = 4;

/** `key`, `*.key`, `*.*.key`, … so a sensitive key is redacted at any depth up to MAX_DEPTH. */
const redactPaths = SENSITIVE_KEYS.flatMap((key) =>
  Array.from({ length: MAX_DEPTH }, (_, depth) => [...Array(depth).fill("*"), key].join(".")),
);

/** JSON logger at LOG_LEVEL. Pass a destination to capture output (tests); stdout otherwise. */
export function createLogger(
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: config.LOG_LEVEL,
    base: { service: "plinth", env: config.NODE_ENV },
    redact: { paths: redactPaths, censor: "[REDACTED]" },
  };
  return destination ? pino(options, destination) : pino(options);
}
