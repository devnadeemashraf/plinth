import { describe, expect, it } from "vitest";
import { z } from "zod";
import { platformErrors } from "#platform/kernel/errors.ts";
import type { RouteDefinition } from "#platform/kernel/http.ts";
import { assertRouteDocs } from "../assert-route-docs.ts";
import { buildDocument, operationId, serializeDocument } from "../build-document.ts";

function route(overrides: Partial<RouteDefinition>): RouteDefinition {
  return {
    method: "GET",
    path: "/v1/plans/{key}",
    summary: "Get a plan",
    description: "Returns one plan.",
    tags: ["plans"],
    auth: "public",
    request: { params: z.strictObject({ key: z.string() }) },
    responses: {
      200: {
        schema: z.strictObject({ key: z.string() }),
        description: "The plan",
        example: { key: "pro" },
      },
    },
    errors: [],
    handler: () => Promise.resolve({ status: 200, body: { key: "pro" } }),
    ...overrides,
  };
}

const bodyRoute = route({
  method: "POST",
  path: "/v1/plans",
  request: { body: z.strictObject({ key: z.string() }) },
});

describe("assertRouteDocs", () => {
  it("[P0-03 #1] A route with an empty description → `assertRouteDocs` throws naming its method and path", () => {
    expect(() =>
      assertRouteDocs([route({}), route({ method: "POST", path: "/v1/plans", description: "" })]),
    ).toThrow(/POST \/v1\/plans: empty description/);
  });

  it("[P0-03 #2] A response without an example → throws", () => {
    const responses = {
      200: {
        schema: z.strictObject({ key: z.string() }),
        description: "The plan",
        example: undefined,
      },
    };
    expect(() => assertRouteDocs([route({ responses })])).toThrow(
      /GET \/v1\/plans\/\{key\}: response 200 has no example/,
    );
  });

  it("lists every problem in one error", () => {
    expect(() =>
      assertRouteDocs([route({ summary: "", tags: [] }), route({ path: "/x", description: "" })]),
    ).toThrow(
      /empty summary[\s\S]*GET \/v1\/plans\/\{key\}: empty tags[\s\S]*GET \/x: empty description/,
    );
  });

  it("accepts fully documented routes", () => {
    expect(() => assertRouteDocs([route({})])).not.toThrow();
  });
});

describe("buildDocument", () => {
  it("[P0-03 #3] Route with `errors: [platformErrors.NOT_FOUND]` → document has a `404` response referencing ProblemDetails", () => {
    const document = buildDocument([route({ errors: [platformErrors.NOT_FOUND] })], "1.2.3");
    const operation = document.paths?.["/v1/plans/{key}"]?.get;
    expect(operation?.responses?.["404"]).toEqual({
      description: "Not found",
      content: {
        "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } },
      },
    });
    expect(document.components?.schemas?.["ProblemDetails"]).toMatchObject({ type: "object" });
  });

  it("[P0-03 #4] Building the document twice → byte-identical JSON", () => {
    const routes = [
      route({ errors: [platformErrors.NOT_FOUND, platformErrors.VALIDATION_FAILED] }),
      bodyRoute,
    ];
    expect(serializeDocument(buildDocument(routes, "1.0.0"))).toBe(
      serializeDocument(buildDocument(routes, "1.0.0")),
    );
  });

  it("fills the document header and the operation from the route", () => {
    const document = buildDocument([route({})], "1.2.3");
    expect(document.openapi).toBe("3.1.0");
    expect(document.info).toEqual({ title: "Plinth API", version: "1.2.3" });
    expect(document.servers).toEqual([{ url: "/" }]);
    const operation = document.paths?.["/v1/plans/{key}"]?.get;
    expect(operation).toMatchObject({
      operationId: "get_v1_plans_key",
      summary: "Get a plan",
      description: "Returns one plan.",
      tags: ["plans"],
      parameters: [{ in: "path", name: "key", required: true }],
      responses: {
        "200": {
          description: "The plan",
          content: { "application/json": { example: { key: "pro" } } },
        },
      },
    });
  });

  it("merges errors sharing a status and keeps an explicit response at that status", () => {
    const taken = { code: "PLAN_TAKEN", status: 409, title: "Plan taken" };
    const merged = buildDocument([route({ errors: [platformErrors.CONFLICT, taken] })], "1.0.0");
    expect(merged.paths?.["/v1/plans/{key}"]?.get?.responses?.["409"]).toMatchObject({
      description: "Conflict; Plan taken",
    });

    const clash = { code: "CLASH", status: 200, title: "Clash" };
    const explicit = buildDocument([route({ errors: [clash] })], "1.0.0");
    expect(explicit.paths?.["/v1/plans/{key}"]?.get?.responses?.["200"]).toMatchObject({
      description: "The plan",
    });
  });

  it("documents a JSON request body", () => {
    const document = buildDocument([bodyRoute], "1.0.0");
    expect(document.paths?.["/v1/plans"]?.post?.requestBody).toMatchObject({
      required: true,
      content: { "application/json": { schema: { type: "object" } } },
    });
  });
});

describe("operationId", () => {
  it("joins method and path, lower-case, non-alphanumerics as `_`", () => {
    expect(operationId("GET", "/v1/plans/{key}")).toBe("get_v1_plans_key");
    expect(operationId("DELETE", "/livez")).toBe("delete_livez");
  });
});

describe("serializeDocument", () => {
  it("sorts keys at every depth, indents 2 spaces and ends with a newline", () => {
    expect(serializeDocument({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe(
      '{\n  "a": {\n    "c": null,\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
    );
  });
});
