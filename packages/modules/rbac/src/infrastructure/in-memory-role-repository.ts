import {
  ForbiddenError,
  type RoleId,
  type TenantContext,
  type TenantId,
  type UserId,
} from "@plinth/core";
import type { Role, ScopeOverwrite } from "@plinth/modules-rbac/domain/role.js";
import type { RoleRepositoryPort } from "@plinth/modules-rbac/ports/repository.js";

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

export class InMemoryRoleRepository implements RoleRepositoryPort {
  readonly #roles = new Map<string, Role>();
  readonly #memberRoles = new Map<string, Set<RoleId>>();
  readonly #scopeOverwrites = new Map<string, ScopeOverwrite>();

  async createRole(role: Role, ctx: TenantContext): Promise<Role> {
    assertTenantAuthorization(role.tenantId, ctx);
    this.#roles.set(String(role.id), { ...role });
    return { ...role };
  }

  async getRoleById(roleId: RoleId, ctx: TenantContext): Promise<Role | null> {
    const role = this.#roles.get(String(roleId));
    if (!role) {
      return null;
    }
    assertTenantAuthorization(role.tenantId, ctx);
    return { ...role };
  }

  async getRoleByName(tenantId: TenantId, name: string, ctx: TenantContext): Promise<Role | null> {
    assertTenantAuthorization(tenantId, ctx);
    const normalized = name.trim().toLowerCase();
    for (const role of this.#roles.values()) {
      if (role.tenantId === tenantId && role.name.toLowerCase() === normalized) {
        return { ...role };
      }
    }
    return null;
  }

  async updateRole(roleId: RoleId, updates: Partial<Role>, ctx: TenantContext): Promise<Role> {
    const existing = this.#roles.get(String(roleId));
    if (!existing) {
      throw new Error(`Role '${roleId}' not found`);
    }
    assertTenantAuthorization(existing.tenantId, ctx);

    const updated: Role = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      updatedAt: new Date().toISOString(),
    };
    this.#roles.set(String(roleId), updated);
    return { ...updated };
  }

  async deleteRole(roleId: RoleId, ctx: TenantContext): Promise<void> {
    const existing = this.#roles.get(String(roleId));
    if (!existing) {
      return;
    }
    assertTenantAuthorization(existing.tenantId, ctx);
    this.#roles.delete(String(roleId));

    // Cleanup member assignments for this role
    for (const assignments of this.#memberRoles.values()) {
      assignments.delete(roleId);
    }

    // Cleanup scope overwrites targeting this role
    for (const [key, ow] of this.#scopeOverwrites.entries()) {
      if (ow.targetId === String(roleId)) {
        this.#scopeOverwrites.delete(key);
      }
    }
  }

  async listRoles(ctx: TenantContext): Promise<Role[]> {
    const results: Role[] = [];
    for (const role of this.#roles.values()) {
      if (ctx.mode === "single" || role.tenantId === ctx.tenantId) {
        results.push({ ...role });
      }
    }
    return results.sort((a, b) => b.position - a.position);
  }

  async assignRoleToMember(
    tenantId: TenantId,
    memberId: UserId,
    roleId: RoleId,
    ctx: TenantContext,
  ): Promise<void> {
    assertTenantAuthorization(tenantId, ctx);
    const key = `${tenantId}:${memberId}`;
    let set = this.#memberRoles.get(key);
    if (!set) {
      set = new Set<RoleId>();
      this.#memberRoles.set(key, set);
    }
    set.add(roleId);
  }

  async removeRoleFromMember(
    tenantId: TenantId,
    memberId: UserId,
    roleId: RoleId,
    ctx: TenantContext,
  ): Promise<void> {
    assertTenantAuthorization(tenantId, ctx);
    const key = `${tenantId}:${memberId}`;
    const set = this.#memberRoles.get(key);
    if (set) {
      set.delete(roleId);
    }
  }

  async getMemberRoles(tenantId: TenantId, memberId: UserId, ctx: TenantContext): Promise<Role[]> {
    assertTenantAuthorization(tenantId, ctx);
    const key = `${tenantId}:${memberId}`;
    const set = this.#memberRoles.get(key);
    if (!set || set.size === 0) {
      return [];
    }

    const roles: Role[] = [];
    for (const roleId of set) {
      const role = this.#roles.get(String(roleId));
      if (role && (ctx.mode === "single" || role.tenantId === ctx.tenantId)) {
        roles.push({ ...role });
      }
    }
    return roles.sort((a, b) => b.position - a.position);
  }

  async setScopeOverwrite(overwrite: ScopeOverwrite, ctx: TenantContext): Promise<void> {
    assertTenantAuthorization(overwrite.tenantId, ctx);
    const key = `${overwrite.tenantId}:${overwrite.scopeId}:${overwrite.targetId}`;
    this.#scopeOverwrites.set(key, { ...overwrite });
  }

  async getScopeOverwrites(
    tenantId: TenantId,
    scopeIds: string[],
    ctx: TenantContext,
  ): Promise<ScopeOverwrite[]> {
    assertTenantAuthorization(tenantId, ctx);
    const scopeSet = new Set(scopeIds);
    const results: ScopeOverwrite[] = [];
    for (const ow of this.#scopeOverwrites.values()) {
      if (ow.tenantId === tenantId && scopeSet.has(ow.scopeId)) {
        results.push({ ...ow });
      }
    }
    return results;
  }
}
