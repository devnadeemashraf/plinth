import { type Config, configSchema } from "./schema.ts";

export interface ConfigIssue {
  readonly key: string;
  readonly reason: string;
}

/** Boot-time failure. The message names keys and reasons only, never a value. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(
      ["Invalid configuration:", ...issues.map(({ key, reason }) => `- ${key}: ${reason}`)].join(
        "\n",
      ),
    );
    this.issues = issues;
  }
}

/** Validates the environment. The only place that reads `process.env`. */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Config {
  const result = configSchema.safeParse(env, { reportInput: false });
  if (result.success) {
    return result.data;
  }
  const reasons = new Map<string, string[]>();
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "(root)");
    reasons.set(key, [...(reasons.get(key) ?? []), issue.message]);
  }
  throw new ConfigError(
    [...reasons].map(([key, messages]) => ({ key, reason: [...new Set(messages)].join("; ") })),
  );
}
