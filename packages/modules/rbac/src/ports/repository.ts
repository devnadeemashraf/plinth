import type { RoleId, TenantContext, TenantId, UserId } from "@plinth/core";
import type { Role, ScopeOverwrite } from "@plinth/modules-rbac/domain/role.js";

export interface RoleRepositoryPort {
  createRole(role: Role, ctx: TenantContext): Promise<Role>;
  getRoleById(roleId: RoleId, ctx: TenantContext): Promise<Role | null>;
  getRoleByName(tenantId: TenantId, name: string, ctx: TenantContext): Promise<Role | null>;
  updateRole(roleId: RoleId, updates: Partial<Role>, ctx: TenantContext): Promise<Role>;
  deleteRole(roleId: RoleId, ctx: TenantContext): Promise<void>;
  listRoles(ctx: TenantContext): Promise<Role[]>;

  assignRoleToMember(
    tenantId: TenantId,
    memberId: UserId,
    roleId: RoleId,
    ctx: TenantContext,
  ): Promise<void>;

  removeRoleFromMember(
    tenantId: TenantId,
    memberId: UserId,
    roleId: RoleId,
    ctx: TenantContext,
  ): Promise<void>;

  getMemberRoles(tenantId: TenantId, memberId: UserId, ctx: TenantContext): Promise<Role[]>;

  setScopeOverwrite(overwrite: ScopeOverwrite, ctx: TenantContext): Promise<void>;

  getScopeOverwrites(
    tenantId: TenantId,
    scopeIds: string[],
    ctx: TenantContext,
  ): Promise<ScopeOverwrite[]>;
}
