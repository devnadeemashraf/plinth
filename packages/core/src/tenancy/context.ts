import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedError } from "@/errors/app-error.js";
import type { Brand } from "@/primitives/brand-types.js";

export type TenantId = Brand<string, "TenantId">;

export function createTenantId(raw: string): TenantId {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Tenant ID cannot be empty");
  }
  return trimmed as TenantId;
}

export interface TenantQuota {
  readonly maxUsers?: number | undefined;
  readonly maxStorageBytes?: number | undefined;
  readonly rateLimitRpm?: number | undefined;
}

export interface TenantContext {
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly mode: "single" | "multi";
  readonly isDefault: boolean;
  readonly tier?: string | undefined;
  readonly quota?: TenantQuota | undefined;
}

export const DEFAULT_TENANT_ID: TenantId = createTenantId("default_tenant");

export const DEFAULT_TENANT_CONTEXT: Readonly<TenantContext> = Object.freeze({
  tenantId: DEFAULT_TENANT_ID,
  slug: "default",
  mode: "single",
  isDefault: true,
});

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export async function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  return tenantStorage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx) {
    throw new UnauthorizedError(
      "Tenant context is required but none was found in the current execution scope",
      {
        code: "TENANT_CONTEXT_REQUIRED",
      },
    );
  }
  return ctx;
}
