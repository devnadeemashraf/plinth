import { isIP } from "node:net";
import type { HttpRequest } from "@/ports/http.js";

export type TenantResolutionStrategy = "header" | "subdomain" | "path";

export interface TenantResolverOptions {
  readonly mode: "single" | "multi";
  readonly strategy?: TenantResolutionStrategy | undefined;
  readonly headerName?: string | undefined;
  readonly rootDomain?: string | undefined;
}

const VALID_SLUG_REGEX = /^[a-zA-Z0-9_-]{1,63}$/;
const PATH_TENANT_REGEX = /(?:^|\/)t\/([a-zA-Z0-9_-]+)(?:\/|$)/;

export function resolveTenantFromRequest(
  req: HttpRequest,
  options: TenantResolverOptions,
): { id?: string; slug?: string } | null {
  if (options.mode === "single") {
    return {
      id: "default_tenant",
      slug: "default",
    };
  }

  const strategy = options.strategy ?? "header";

  switch (strategy) {
    case "header": {
      const headerKey = (options.headerName ?? "x-tenant-id").toLowerCase();
      const rawHeader = req.headers[headerKey];
      if (typeof rawHeader !== "string") {
        return null;
      }

      const trimmed = rawHeader.trim();
      if (!VALID_SLUG_REGEX.test(trimmed)) {
        return null;
      }

      const normalized = trimmed.toLowerCase();
      return {
        id: normalized,
        slug: normalized,
      };
    }

    case "subdomain": {
      const rawHost = req.headers["host"];
      if (typeof rawHost !== "string" || !options.rootDomain) {
        return null;
      }

      // Strip port if present
      const hostname = rawHost.split(":")[0]?.toLowerCase() ?? "";

      // Ignore direct IP access or localhost
      if (isIP(hostname) !== 0 || hostname === "localhost" || hostname.endsWith(".localhost")) {
        return null;
      }

      const root = options.rootDomain.toLowerCase();
      if (hostname === root) {
        return null; // Apex domain has no tenant subdomain
      }

      if (hostname.endsWith(`.${root}`)) {
        const subdomain = hostname.slice(0, -(root.length + 1));
        if (VALID_SLUG_REGEX.test(subdomain)) {
          return {
            slug: subdomain.toLowerCase(),
          };
        }
      }

      return null;
    }

    case "path": {
      const pathToCheck = req.path || req.url || "";
      const match = pathToCheck.match(PATH_TENANT_REGEX);
      if (match?.[1] && VALID_SLUG_REGEX.test(match[1])) {
        return {
          slug: match[1].toLowerCase(),
        };
      }
      return null;
    }
  }
}
