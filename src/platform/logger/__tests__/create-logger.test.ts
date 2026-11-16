import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { loadConfig } from "#platform/config/load.ts";
import { createLogger } from "../create-logger.ts";

/** Keys without a default; nothing connects to this URL. */
const required = {
  DATABASE_URL: "postgres://plinth@127.0.0.1:5432/plinth_test",
};

function capture(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  const lines = () =>
    chunks
      .join("")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, lines };
}

describe("createLogger", () => {
  it('[P0-01 #9] Logger writing `{ password: "p", nested: { token: "t", deeper: { secret: "s" } } }` → output has `[REDACTED]` for all three and no raw values', () => {
    const { stream, lines } = capture();
    const logger = createLogger(loadConfig(required), stream);
    logger.info({ password: "p", nested: { token: "t", deeper: { secret: "s" } } }, "hello");
    const [line] = lines();
    expect(line?.["password"]).toBe("[REDACTED]");
    expect(line?.["nested"]).toEqual({ token: "[REDACTED]", deeper: { secret: "[REDACTED]" } });
    const raw = JSON.stringify(line);
    expect(raw).not.toContain('"p"');
    expect(raw).not.toContain('"t"');
    expect(raw).not.toContain('"s"');
  });

  it("writes JSON with the service and env bindings at the configured level", () => {
    const { stream, lines } = capture();
    const logger = createLogger(
      loadConfig({ ...required, LOG_LEVEL: "warn", NODE_ENV: "test" }),
      stream,
    );
    logger.info({ ignored: true }, "below level");
    logger.child({ requestId: "r1" }).warn({ authorization: "Bearer x" }, "kept");
    const output = lines();
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({
      service: "plinth",
      env: "test",
      requestId: "r1",
      authorization: "[REDACTED]",
      msg: "kept",
    });
  });

  it("redacts a key four levels deep", () => {
    const { stream, lines } = capture();
    createLogger(loadConfig(required), stream).info({ a: { b: { c: { cookie: "k" } } } });
    expect(lines()[0]?.["a"]).toEqual({ b: { c: { cookie: "[REDACTED]" } } });
  });
});
