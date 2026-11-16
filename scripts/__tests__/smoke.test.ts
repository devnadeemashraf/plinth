import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { freePort } from "../../test/support/process.ts";

const script = resolve("scripts/smoke.ts");

interface SmokeResult {
  readonly code: number | null;
  readonly output: string;
  readonly elapsedMs: number;
}

async function runSmoke(args: readonly string[]): Promise<SmokeResult> {
  const started = performance.now();
  const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += String(chunk);
  });
  const [code] = (await once(child, "close")) as [number | null];
  return { code, output, elapsedMs: performance.now() - started };
}

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server?.close(done));
    server = undefined;
  }
});

/** Serves `/livez` and `/openapi.json` with 200 and `/readyz` with the status `readyz()` returns. */
async function startServer(readyz: () => number): Promise<string> {
  server = createServer((request, response) => {
    const status =
      request.url === "/readyz"
        ? readyz()
        : request.url === "/livez" || request.url === "/openapi.json"
          ? 200
          : 404;
    response.writeHead(status, { "content-type": "application/json" }).end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}` : "";
}

describe("smoke script", () => {
  it("[P0-05 #1] Server whose `/readyz` returns 503 for 2 s, then 200 → smoke exits 0", async () => {
    const readyAt = performance.now() + 2000;
    const url = await startServer(() => (performance.now() < readyAt ? 503 : 200));
    const run = await runSmoke([url]);
    expect(run.output).toContain("/readyz");
    expect(run.code).toBe(0);
  });

  it("[P0-05 #2] Server whose `/readyz` always returns 503, `--timeout-ms 1000` → exit 1 within 2 s, message names `/readyz`", async () => {
    const url = await startServer(() => 503);
    const run = await runSmoke([url, "--timeout-ms", "1000"]);
    expect(run.code).toBe(1);
    expect(run.elapsedMs).toBeLessThan(2000);
    expect(run.output).toContain("/readyz");
  });

  it("[P0-05 #3] Unreachable base URL → exit 1, output contains no stack trace", async () => {
    const port = await freePort();
    const run = await runSmoke([`http://127.0.0.1:${port}`, "--timeout-ms", "1000"]);
    expect(run.code).toBe(1);
    expect(run.output).not.toMatch(/^\s+at /m);
    expect(run.output).not.toContain("Error:");
  });

  it("fails when an endpoint after readiness does not return 200", async () => {
    server = createServer((request, response) => {
      response.writeHead(request.url === "/openapi.json" ? 500 : 200).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const run = await runSmoke([`http://127.0.0.1:${port}`]);
    expect(run.code).toBe(1);
    expect(run.output).toContain("/openapi.json");
  });

  it("rejects a missing base URL or a bad timeout with exit 1", async () => {
    expect((await runSmoke([])).code).toBe(1);
    expect((await runSmoke(["http://127.0.0.1:1", "--timeout-ms", "soon"])).code).toBe(1);
  });
});
