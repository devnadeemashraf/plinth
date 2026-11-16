import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../load.ts";

/** Keys without a default; nothing connects to this URL. */
const required = {
  DATABASE_URL: "postgres://plinth@127.0.0.1:5432/plinth_test",
};

function configError(env: Record<string, string>): ConfigError {
  try {
    loadConfig({ ...required, ...env });
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected loadConfig to throw ConfigError");
}

describe("loadConfig", () => {
  it("[P0-01 #1] env `{}` → defaults: PORT 3000, NODE_ENV development, LOG_LEVEL info, PUBLIC_DOCS true, CORS_ORIGINS []", () => {
    const config = loadConfig(required);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.PUBLIC_DOCS).toBe(true);
    expect(config.CORS_ORIGINS).toEqual([]);
  });

  it('[P0-01 #2] PORT `"0"` → ConfigError naming PORT; `"65536"` → ConfigError; `"65535"` → 65535', () => {
    expect(configError({ PORT: "0" }).message).toContain("- PORT:");
    expect(configError({ PORT: "65536" }).message).toContain("- PORT:");
    expect(loadConfig({ ...required, PORT: "65535" }).PORT).toBe(65535);
  });

  it('[P0-01 #3] PORT `"abc"` and LOG_LEVEL `"loud"` together → one ConfigError listing both keys', () => {
    const error = configError({ PORT: "abc", LOG_LEVEL: "loud" });
    expect(error.message.startsWith("Invalid configuration:\n")).toBe(true);
    expect(error.message).toContain("- PORT:");
    expect(error.message).toContain("- LOG_LEVEL:");
    expect(error.issues.map((issue) => issue.key).sort()).toEqual(["LOG_LEVEL", "PORT"]);
  });

  it('[P0-01 #4] PORT `"s3cr3t-value"` → the ConfigError message does not contain `s3cr3t-value`', () => {
    const error = configError({ PORT: "s3cr3t-value" });
    expect(error.message).toContain("- PORT:");
    expect(error.message).not.toContain("s3cr3t-value");
  });

  it('[P0-01 #5] PUBLIC_DOCS `"yes"` → ConfigError; `"false"` → false', () => {
    expect(configError({ PUBLIC_DOCS: "yes" }).message).toContain("- PUBLIC_DOCS:");
    expect(loadConfig({ ...required, PUBLIC_DOCS: "false" }).PUBLIC_DOCS).toBe(false);
  });

  it('[P0-01 #6] CORS_ORIGINS `"https://a.com,https://b.com"` → two origins; `"ftp://a.com"` → ConfigError', () => {
    expect(
      loadConfig({ ...required, CORS_ORIGINS: "https://a.com,https://b.com" }).CORS_ORIGINS,
    ).toEqual(["https://a.com", "https://b.com"]);
    expect(configError({ CORS_ORIGINS: "ftp://a.com" }).message).toContain("- CORS_ORIGINS:");
  });

  it("rejects an origin that carries a path or is not a URL", () => {
    expect(configError({ CORS_ORIGINS: "https://a.com/app" }).message).toContain("- CORS_ORIGINS:");
    expect(configError({ CORS_ORIGINS: "a.com" }).message).toContain("- CORS_ORIGINS:");
  });

  it("reports several problems on one key in one line", () => {
    const error = configError({ CORS_ORIGINS: "ftp://a.com,ftp://b.com" });
    expect(error.message.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(1);
  });

  it("parses every other key from its string form", () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: "production",
      HTTP_ADAPTER: "express",
      TRUST_PROXY: "2",
      BODY_LIMIT_BYTES: "10485760",
    });
    expect(config.NODE_ENV).toBe("production");
    expect(config.HTTP_ADAPTER).toBe("express");
    expect(config.TRUST_PROXY).toBe(2);
    expect(config.BODY_LIMIT_BYTES).toBe(10485760);
    expect(configError({ BODY_LIMIT_BYTES: "10485761" }).message).toContain("- BODY_LIMIT_BYTES:");
    expect(configError({ TRUST_PROXY: "-1" }).message).toContain("- TRUST_PROXY:");
  });
});
