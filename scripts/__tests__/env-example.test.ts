import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderEnvExample } from "../env-example.ts";

describe("env-example", () => {
  it("[P0-01 #11] `.env.example` on disk → equals the generator's output", () => {
    expect(readFileSync(".env.example", "utf8")).toBe(renderEnvExample());
  });

  it("lists every config key with its default", () => {
    const lines = renderEnvExample().split("\n");
    for (const line of [
      "NODE_ENV=development",
      "PORT=3000",
      "LOG_LEVEL=info",
      "HTTP_ADAPTER=express",
      "TRUST_PROXY=0",
      "CORS_ORIGINS=",
      "BODY_LIMIT_BYTES=1048576",
      "PUBLIC_DOCS=true",
    ]) {
      expect(lines).toContain(line);
    }
  });
});
