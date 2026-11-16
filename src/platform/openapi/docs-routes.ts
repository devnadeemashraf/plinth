import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PipelineRoute } from "#platform/http/pipeline.ts";

export interface DocsRoutesDeps {
  /** The document served at `/openapi.json`. */
  readonly document: object;
  readonly publicDocs: boolean;
}

/** The Scalar page needs inline styles and data: images and fonts, nothing more. */
export const DOCS_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:";

const DOCS_HTML = [
  "<!doctype html>",
  '<html lang="en">',
  '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plinth API</title></head>',
  '<body><script id="api-reference" data-url="/openapi.json"></script><script src="/docs/scalar.js"></script></body>',
  "</html>",
  "",
].join("\n");

/** The package exports no path to its browser bundle, so it is found beside the main entry. */
function readScalarBundle(): string {
  const entry = createRequire(import.meta.url).resolve("@scalar/api-reference");
  return readFileSync(join(dirname(entry), "browser", "standalone.js"), "utf8");
}

function docsRoute(
  path: string,
  overrides: Pick<PipelineRoute, "summary" | "description" | "responses" | "handler"> &
    Partial<PipelineRoute>,
): PipelineRoute {
  return {
    method: "GET",
    path,
    tags: ["docs"],
    auth: "public",
    request: {},
    errors: [],
    ...overrides,
  };
}

/** `/openapi.json`, `/docs` and `/docs/scalar.js`; none of them exist unless PUBLIC_DOCS is true. */
export function docsRoutes({ document, publicDocs }: DocsRoutesDeps): PipelineRoute[] {
  if (!publicDocs) {
    return [];
  }
  const scalar = readScalarBundle();
  return [
    docsRoute("/openapi.json", {
      summary: "OpenAPI document",
      description: "The OpenAPI 3.1 document for this API.",
      responses: {
        200: { schema: z.unknown(), description: "The document", example: { openapi: "3.1.0" } },
      },
      handler: () => Promise.resolve({ status: 200, body: document }),
    }),
    docsRoute("/docs", {
      summary: "API reference",
      description: "The Scalar API reference page for `/openapi.json`.",
      contentSecurityPolicy: DOCS_CSP,
      responses: { 200: { schema: z.string(), description: "HTML page", example: DOCS_HTML } },
      handler: () =>
        Promise.resolve({
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: DOCS_HTML,
        }),
    }),
    docsRoute("/docs/scalar.js", {
      summary: "API reference script",
      description: "The standalone Scalar bundle the reference page loads.",
      contentSecurityPolicy: DOCS_CSP,
      responses: { 200: { schema: z.string(), description: "JavaScript", example: "" } },
      handler: () =>
        Promise.resolve({
          status: 200,
          headers: { "content-type": "text/javascript; charset=utf-8" },
          body: scalar,
        }),
    }),
  ];
}
