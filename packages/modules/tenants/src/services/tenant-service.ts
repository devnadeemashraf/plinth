import { NotFoundError, type TenantContext, ValidationError } from "@plinth/core";
import {
  type CreateTenantDto,
  createTenantSchema,
  type Tenant,
  type UpdateTenantDto,
  updateTenantSchema,
} from "@plinth/modules-tenants/domain/tenant.js";
import type { TenantRepositoryPort } from "@plinth/modules-tenants/ports/repository.js";

export class TenantService {
  readonly #repo: TenantRepositoryPort;

  constructor(repo: TenantRepositoryPort) {
    this.#repo = repo;
  }

  async getTenantBySlug(slug: string, ctx: TenantContext): Promise<Tenant> {
    const tenant = await this.#repo.findBySlug(slug, ctx);
    if (!tenant) {
      throw new NotFoundError(`Tenant with slug '${slug}' was not found`, {
        code: "TENANT_NOT_FOUND",
      });
    }
    return tenant;
  }

  async createTenant(input: unknown, ctx: TenantContext): Promise<Tenant> {
    const parsed = createTenantSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid tenant creation payload", {
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }

    const dto: CreateTenantDto = {
      slug: parsed.data.slug,
      name: parsed.data.name,
      plan: parsed.data.plan,
      ...(parsed.data.quota !== undefined ? { quota: parsed.data.quota } : {}),
    };

    return this.#repo.create(dto, ctx);
  }

  async updateTenant(slug: string, input: unknown, ctx: TenantContext): Promise<Tenant> {
    const parsed = updateTenantSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("Invalid tenant update payload", {
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }

    const tenant = await this.getTenantBySlug(slug, ctx);

    const patch: UpdateTenantDto = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.plan !== undefined ? { plan: parsed.data.plan } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.quota !== undefined ? { quota: parsed.data.quota } : {}),
    };

    return this.#repo.update(tenant.id, patch, ctx);
  }

  async deleteTenant(slug: string, ctx: TenantContext): Promise<boolean> {
    const tenant = await this.getTenantBySlug(slug, ctx);
    return this.#repo.delete(tenant.id, ctx);
  }
}
