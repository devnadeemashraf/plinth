/**
 * `node scripts/smoke.ts <baseUrl> [--timeout-ms N]` (default 30000): polls `/readyz` every
 * 500 ms until it returns 200 or the timeout passes, then asserts `/livez` and `/openapi.json`
 * return 200 and `GET /v1/plans` lists the seeded plan `free`. Prints one line per assertion and
 * exits 0 when all pass, 1 otherwise.
 */
import { setTimeout as sleep } from "node:timers/promises";

const POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

/** The response status, or a short reason when no response arrived. */
async function probe(url: string, timeoutMs: number): Promise<number | string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(timeoutMs, 1)) });
    await response.body?.cancel();
    return response.status;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause instanceof Error && "code" in cause ? String(cause.code) : "no response";
  }
}

async function waitForReady(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  let last: number | string = "no response";
  for (;;) {
    const left = deadline - performance.now();
    last = await probe(`${baseUrl}/readyz`, Math.min(left, 5000));
    if (last === 200) {
      console.log("✓ /readyz 200");
      return true;
    }
    if (performance.now() + POLL_MS >= deadline) {
      console.log(`✗ /readyz did not return 200 within ${timeoutMs} ms (last: ${last})`);
      return false;
    }
    await sleep(POLL_MS);
  }
}

async function expect200(baseUrl: string, path: string): Promise<boolean> {
  const result = await probe(`${baseUrl}${path}`, 5000);
  console.log(result === 200 ? `✓ ${path} 200` : `✗ ${path} returned ${result}, expected 200`);
  return result === 200;
}

/** The keys of the plans `GET /v1/plans` lists, or a short reason when it did not answer them. */
async function planKeys(baseUrl: string): Promise<string[] | string> {
  try {
    const response = await fetch(`${baseUrl}/v1/plans`, { signal: AbortSignal.timeout(5000) });
    if (response.status !== 200) {
      await response.body?.cancel();
      return `status ${response.status}`;
    }
    const body = (await response.json()) as { data?: { key?: unknown }[] };
    return Array.isArray(body.data) ? body.data.map(({ key }) => String(key)) : "no data array";
  } catch {
    return "no JSON response";
  }
}

async function expectFreePlan(baseUrl: string): Promise<boolean> {
  const keys = await planKeys(baseUrl);
  const found = Array.isArray(keys) && keys.includes("free");
  const got = Array.isArray(keys) ? `keys [${keys.join(", ")}]` : keys;
  console.log(found ? "✓ /v1/plans lists free" : `✗ /v1/plans does not list free (${got})`);
  return found;
}

function parseArgs(args: readonly string[]): { baseUrl: string; timeoutMs: number } | string {
  const [baseUrl, flag, value] = args;
  if (!baseUrl || !URL.canParse(baseUrl)) {
    return "usage: node scripts/smoke.ts <baseUrl> [--timeout-ms N]";
  }
  if (flag === undefined) {
    return { baseUrl: baseUrl.replace(/\/+$/, ""), timeoutMs: DEFAULT_TIMEOUT_MS };
  }
  if (flag !== "--timeout-ms" || !value || !/^\d+$/.test(value)) {
    return "--timeout-ms takes a whole number of milliseconds";
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), timeoutMs: Number(value) };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === "string") {
    console.log(`✗ ${args}`);
    return 1;
  }
  if (!(await waitForReady(args.baseUrl, args.timeoutMs))) {
    return 1;
  }
  const live = await expect200(args.baseUrl, "/livez");
  const openapi = await expect200(args.baseUrl, "/openapi.json");
  const plans = await expectFreePlan(args.baseUrl);
  return live && openapi && plans ? 0 : 1;
}

process.exitCode = await main();
