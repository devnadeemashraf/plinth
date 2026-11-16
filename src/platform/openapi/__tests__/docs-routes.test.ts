import { afterEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "../../../../test/support/http.ts";
import { DOCS_CSP, docsRoutes } from "../docs-routes.ts";

const document = { openapi: "3.1.0", info: { title: "Plinth API", version: "0.0.0" }, paths: {} };

let current: TestServer | undefined;

async function serve(publicDocs: boolean): Promise<TestServer> {
  current = await startTestServer(docsRoutes({ document, publicDocs }));
  return current;
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe("docs routes", () => {
  it("[P0-03 #6] PUBLIC_DOCS false → `/docs`, `/docs/scalar.js` and `/openapi.json` return 404", async () => {
    const { url } = await serve(false);
    for (const path of ["/docs", "/docs/scalar.js", "/openapi.json"]) {
      expect((await fetch(`${url}${path}`)).status).toBe(404);
    }
  });

  it("[P0-03 #7] GET `/docs` → 200 text/html, CSP contains no `unsafe-eval`", async () => {
    const { url } = await serve(true);
    const response = await fetch(`${url}/docs`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    const csp = response.headers.get("content-security-policy");
    expect(csp).toBe(DOCS_CSP);
    expect(csp).not.toContain("unsafe-eval");
    expect(await response.text()).toContain(
      '<script id="api-reference" data-url="/openapi.json"></script><script src="/docs/scalar.js"></script>',
    );
  });

  it("serves the Scalar bundle as JavaScript under the docs CSP", async () => {
    const { url } = await serve(true);
    const response = await fetch(`${url}/docs/scalar.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(response.headers.get("content-security-policy")).toBe(DOCS_CSP);
    expect((await response.text()).length).toBeGreaterThan(100_000);
  });

  it("serves the in-memory document at `/openapi.json` under the default CSP", async () => {
    const { url } = await serve(true);
    const response = await fetch(`${url}/openapi.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(document);
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});
