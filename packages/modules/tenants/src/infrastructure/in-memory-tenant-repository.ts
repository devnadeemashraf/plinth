import {
  BadRequestError,
  ConflictError,
  createTenantId,
  DEFAULT_TENANT_ID,
  ForbiddenError,
  generateUuidV7,
  NotFoundError,
  type TenantContext,
  type TenantId,
} from "@plinth/core";
import type {
  CreateTenantDto,
  Tenant,
  UpdateTenantDto,
} from "@plinth/modules-tenants/domain/tenant.js";
import type { TenantRepositoryPort } from "@plinth/modules-tenants/ports/repository.js";

function assertTenantAuthorization(targetTenantId: TenantId, ctx: TenantContext): void {
  if (ctx.mode === "single") {
    return;
  }
  if (ctx.tenantId !== targetTenantId) {
    throw new ForbiddenError(
      `Cross-tenant access forbidden: active tenant '${ctx.tenantId}' cannot access '${targetTenantId}'`,
      { code: "CROSS_TENANT_FORBIDDEN" },
    );
  }
}

export class InMemoryTenantRepository implements TenantRepositoryPort {
  readonly #tenants = new Map<string, Tenant>();

  constructor() {
    const now = new Date().toISOString();
    const defaultTenant: Tenant = {
      id: DEFAULT_TENANT_ID,
      slug: "default",
      name: "Default Organization",
      plan: "enterprise",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.#tenants.set(defaultTenant.id, defaultTenant);
  }

  async findById(id: TenantId, ctx: TenantContext): Promise<Tenant | null> {
    assertTenantAuthorization(id, ctx);
    return this.#tenants.get(id) ?? null;
  }

  async findBySlug(slug: string, ctx: TenantContext): Promise<Tenant | null> {
    const normalized = slug.toLowerCase();
    for (const tenant of this.#tenants.values()) {
      if (tenant.slug.toLowerCase() === normalized) {
        assertTenantAuthorization(tenant.id, ctx);
        return tenant;
      }
    }
    return null;
  }

  async create(data: CreateTenantDto, _ctx: TenantContext): Promise<Tenant> {
    const normalizedSlug = data.slug.toLowerCase();

    for (const tenant of this.#tenants.values()) {
      if (tenant.slug.toLowerCase() === normalizedSlug) {
        throw new ConflictError(`Tenant with slug '${data.slug}' already exists`, {
          code: "TENANT_SLUG_CONFLICT",
        });
      }
    }

    const id = createTenantId(`t_${generateUuidV7().replace(/-/g, "").slice(0, 16)}`);
    const now = new Date().toISOString();

    const newTenant: Tenant = {
      id,
      slug: normalizedSlug,
      name: data.name,
      plan: data.plan ?? "free",
      status: "active",
      ...(data.quota !== undefined ? { quota: data.quota } : {}),
      createdAt: now,
      updatedAt: now,
    };

    this.#tenants.set(id, newTenant);
    return newTenant;
  }

  async update(id: TenantId, patch: UpdateTenantDto, ctx: TenantContext): Promise<Tenant> {
    assertTenantAuthorization(id, ctx);

    const existing = this.#tenants.get(id);
    if (!existing) {
      throw new NotFoundError(`Tenant '${id}' not found`, {
        code: "TENANT_NOT_FOUND",
      });
    }

    const now = new Date().toISOString();
    const updated: Tenant = {
      id: existing.id,
      slug: existing.slug,
      name: patch.name ?? existing.name,
      plan: patch.plan ?? existing.plan,
      status: patch.status ?? existing.status,
      quota: patch.quota !== undefined ? patch.quota : existing.quota,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    this.#tenants.set(id, updated);
    return updated;
  }

  async delete(id: TenantId, ctx: TenantContext): Promise<boolean> {
    assertTenantAuthorization(id, ctx);

    if (id === DEFAULT_TENANT_ID) {
      throw new BadRequestError("Cannot delete default tenant", {
        code: "CANNOT_DELETE_DEFAULT_TENANT",
      });
    }

    return this.#tenants.delete(id);
  }
}
