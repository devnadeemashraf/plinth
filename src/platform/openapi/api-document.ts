import type { RouteDefinition } from "#platform/kernel/http.ts";
import packageJson from "../../../package.json" with { type: "json" };
import { buildDocument } from "./build-document.ts";

/** The document for `routes`, versioned with package.json. */
export const apiDocument = (routes: readonly RouteDefinition[]) =>
  buildDocument(routes, packageJson.version);
