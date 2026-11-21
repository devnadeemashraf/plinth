import { UnauthorizedError } from "@/errors/app-error.js";
import { requireTenantContext, type TenantContext } from "@/tenancy/context.js";

export function assertTenantContext(ctx: unknown): asserts ctx is TenantContext {
  if (
    !ctx ||
    typeof ctx !== "object" ||
    !("tenantId" in ctx) ||
    typeof (ctx as { tenantId: unknown }).tenantId !== "string" ||
    !("slug" in ctx) ||
    typeof (ctx as { slug: unknown }).slug !== "string"
  ) {
    throw new UnauthorizedError("Valid TenantContext is required to execute this operation", {
      code: "INVALID_TENANT_CONTEXT",
    });
  }
}

export async function withTenantGuard<T>(fn: (ctx: TenantContext) => Promise<T> | T): Promise<T> {
  const ctx = requireTenantContext();
  return fn(ctx);
}
