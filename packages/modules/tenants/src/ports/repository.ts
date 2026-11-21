import type { TenantContext, TenantId } from "@plinth/core";
import type {
  CreateTenantDto,
  Tenant,
  UpdateTenantDto,
} from "@plinth/modules-tenants/domain/tenant.js";

export interface TenantRepositoryPort {
  findById(id: TenantId, ctx: TenantContext): Promise<Tenant | null>;
  findBySlug(slug: string, ctx: TenantContext): Promise<Tenant | null>;
  create(data: CreateTenantDto, ctx: TenantContext): Promise<Tenant>;
  update(id: TenantId, patch: UpdateTenantDto, ctx: TenantContext): Promise<Tenant>;
  delete(id: TenantId, ctx: TenantContext): Promise<boolean>;
}
