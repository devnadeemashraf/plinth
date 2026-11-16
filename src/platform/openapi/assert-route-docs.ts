import type { RouteDefinition } from "#platform/kernel/http.ts";

/** Throws at boot, listing every route whose documentation is incomplete. */
export function assertRouteDocs(routes: readonly RouteDefinition[]): void {
  const problems: string[] = [];
  for (const route of routes) {
    const name = `${route.method} ${route.path}`;
    for (const field of ["summary", "description"] as const) {
      if (route[field].trim() === "") {
        problems.push(`${name}: empty ${field}`);
      }
    }
    if (route.tags.length === 0) {
      problems.push(`${name}: empty tags`);
    }
    for (const [status, response] of Object.entries(route.responses)) {
      if (response.example === undefined) {
        problems.push(`${name}: response ${status} has no example`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Undocumented routes:\n${problems.join("\n")}`);
  }
}
