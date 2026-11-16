import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { spawnApi } from "../../../../../test/support/process.ts";

/** Sends the headers now and the body after `delayMs`, so the request stays in flight meanwhile. */
function slowRequest(url: string, delayMs: number): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const body = "{}";
    const req = request(`${url}/livez`, {
      method: "GET",
      agent: false,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    });
    req.on("response", (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    req.on("error", reject);
    req.flushHeaders();
    setTimeout(() => req.end(body), delayMs);
  });
}

describe("api process", () => {
  it("[P0-02 #12] SIGTERM during an in-flight 300 ms request (spawned `src/main/api.ts`) → the request completes 200 and the process exits 0", async () => {
    const api = await spawnApi();
    const status = slowRequest(api.url, 300);
    await new Promise((resolve) => setTimeout(resolve, 100));
    api.terminate();
    expect(await status).toBe(200);
    expect(await api.exited).toBe(0);
  }, 15_000);
});
