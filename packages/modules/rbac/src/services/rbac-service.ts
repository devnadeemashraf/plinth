import {
  type ActorRankContext,
  ADMINISTRATOR_BIT,
  assertCanManageRole,
  BadRequestError,
  ConflictError,
  createRoleId,
  defaultPermissionRegistry,
  evaluateEffectivePermissions,
  ForbiddenError,
  fromCanonicalHex,
  generateUuidV7,
  hasBit,
  NotFoundError,
  type RoleId,
  type ScopeLevel,
  type TenantContext,
  toCanonicalHex,
  type UserId,
  validateRoleMetadata,
} from "@plinth/core";
import type {
  CreateRoleDto,
  Role,
  ScopeOverwrite,
  SetScopeOverwriteDto,
  UpdateRoleDto,
} from "@plinth/modules-rbac/domain/role.js";
import type { RoleRepositoryPort } from "@plinth/modules-rbac/ports/repository.js";

export interface RbacServiceOptions {
  readonly allowCustomRoles?: boolean | undefined;
  readonly roleScopeMode?: "global" | "tenant_isolated" | undefined;
}

export interface MemberEvaluationResult {
  readonly effectiveMask: bigint;
  readonly effectiveMaskHex: string;
  readonly permissions: string[];
}

export class RbacService {
  readonly #repo: RoleRepositoryPort;
  readonly #allowCustomRoles: boolean;
  readonly #roleScopeMode: "global" | "tenant_isolated";

  constructor(repo: RoleRepositoryPort, options: RbacServiceOptions = {}) {
    this.#repo = repo;
    this.#allowCustomRoles = options.allowCustomRoles ?? true;
    this.#roleScopeMode = options.roleScopeMode ?? "tenant_isolated";
  }

  get allowCustomRoles(): boolean {
    return this.#allowCustomRoles;
  }

  get roleScopeMode(): "global" | "tenant_isolated" {
    return this.#roleScopeMode;
  }

  async createRole(dto: CreateRoleDto, actor: ActorRankContext, ctx: TenantContext): Promise<Role> {
    if (!this.#allowCustomRoles && !dto.isSystem) {
      throw new ForbiddenError("Custom roles are disabled by configuration", {
        code: "CUSTOM_ROLES_DISABLED",
      });
    }

    const parsedMask = fromCanonicalHex(dto.permissionsHex);
    if (!parsedMask.ok) {
      throw parsedMask.error;
    }
    const permissions = parsedMask.value;

    if (dto.metadata) {
      const metaResult = validateRoleMetadata(dto.metadata);
      if (!metaResult.ok) {
        throw metaResult.error;
      }
    }

    // Rank anti-escalation invariant: actor position > role position AND permissions subset
    assertCanManageRole(actor, { position: dto.position, permissions });

    const existing = await this.#repo.getRoleByName(ctx.tenantId, dto.name, ctx);
    if (existing) {
      throw new ConflictError(`Role '${dto.name}' already exists in this tenant`, {
        code: "ROLE_NAME_CONFLICT",
      });
    }

    const now = new Date().toISOString();
    const role: Role = {
      id: createRoleId(generateUuidV7()),
      tenantId: ctx.tenantId,
      name: dto.name.trim(),
      permissions,
      position: dto.position,
      isSystem: dto.isSystem ?? false,
      ...(dto.metadata ? { metadata: dto.metadata } : {}),
      createdAt: now,
      updatedAt: now,
    };

    return this.#repo.createRole(role, ctx);
  }

  async getRole(roleId: RoleId, ctx: TenantContext): Promise<Role> {
    const role = await this.#repo.getRoleById(roleId, ctx);
    if (!role) {
      throw new NotFoundError(`Role '${roleId}' not found`, {
        code: "ROLE_NOT_FOUND",
      });
    }
    return role;
  }

  async updateRole(
    roleId: RoleId,
    dto: UpdateRoleDto,
    actor: ActorRankContext,
    ctx: TenantContext,
  ): Promise<Role> {
    const existing = await this.getRole(roleId, ctx);

    let updatedPermissions = existing.permissions;
    if (dto.permissionsHex !== undefined) {
      const parsedMask = fromCanonicalHex(dto.permissionsHex);
      if (!parsedMask.ok) {
        throw parsedMask.error;
      }
      updatedPermissions = parsedMask.value;
    }

    const updatedPosition = dto.position !== undefined ? dto.position : existing.position;

    // Verify actor can manage both existing and proposed state
    assertCanManageRole(actor, existing, {
      position: updatedPosition,
      permissions: updatedPermissions,
    });

    if (dto.metadata) {
      const metaResult = validateRoleMetadata(dto.metadata);
      if (!metaResult.ok) {
        throw metaResult.error;
      }
    }

    if (dto.name && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.#repo.getRoleByName(ctx.tenantId, dto.name, ctx);
      if (duplicate && duplicate.id !== roleId) {
        throw new ConflictError(`Role name '${dto.name}' already in use`, {
          code: "ROLE_NAME_CONFLICT",
        });
      }
    }

    const updatePayload: Partial<Role> = {
      permissions: updatedPermissions,
      position: updatedPosition,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
    };

    return this.#repo.updateRole(roleId, updatePayload, ctx);
  }

  async deleteRole(roleId: RoleId, actor: ActorRankContext, ctx: TenantContext): Promise<void> {
    const existing = await this.getRole(roleId, ctx);
    if (existing.isSystem) {
      throw new ForbiddenError(`Cannot delete system role '${existing.name}'`, {
        code: "SYSTEM_ROLE_IMMUTABLE",
      });
    }

    assertCanManageRole(actor, existing);
    await this.#repo.deleteRole(roleId, ctx);
  }

  async listRoles(ctx: TenantContext): Promise<Role[]> {
    return this.#repo.listRoles(ctx);
  }

  async assignRoleToMember(
    memberId: UserId,
    roleId: RoleId,
    actor: ActorRankContext,
    ctx: TenantContext,
  ): Promise<void> {
    const role = await this.getRole(roleId, ctx);
    assertCanManageRole(actor, role);

    await this.#repo.assignRoleToMember(ctx.tenantId, memberId, roleId, ctx);
  }

  async removeRoleFromMember(
    memberId: UserId,
    roleId: RoleId,
    actor: ActorRankContext,
    ctx: TenantContext,
  ): Promise<void> {
    const role = await this.getRole(roleId, ctx);
    assertCanManageRole(actor, role);

    await this.#repo.removeRoleFromMember(ctx.tenantId, memberId, roleId, ctx);
  }

  async getMemberRoles(memberId: UserId, ctx: TenantContext): Promise<Role[]> {
    return this.#repo.getMemberRoles(ctx.tenantId, memberId, ctx);
  }

  async setScopeOverwrite(
    dto: SetScopeOverwriteDto,
    actor: ActorRankContext,
    ctx: TenantContext,
  ): Promise<void> {
    const allowRes = fromCanonicalHex(dto.allowHex);
    if (!allowRes.ok) {
      throw allowRes.error;
    }

    const denyRes = fromCanonicalHex(dto.denyHex);
    if (!denyRes.ok) {
      throw denyRes.error;
    }

    // Actor cannot grant allow permissions they themselves do not possess
    assertCanManageRole(actor, { position: -1, permissions: allowRes.value });

    // Target rank check to prevent lower-rank actors from altering scopes of higher-rank roles or members
    if (dto.targetType === "role") {
      const targetRole = await this.getRole(createRoleId(dto.targetId), ctx);
      assertCanManageRole(actor, targetRole);
    } else if (dto.targetType === "member") {
      const memberRoles = await this.#repo.getMemberRoles(
        ctx.tenantId,
        dto.targetId as UserId,
        ctx,
      );
      const targetHighest =
        memberRoles.length > 0 ? Math.max(...memberRoles.map((r) => r.position)) : 0;
      if (
        actor.highestPosition <= targetHighest &&
        !hasBit(actor.effectivePermissions, ADMINISTRATOR_BIT)
      ) {
        throw new ForbiddenError(
          `Cannot modify scope overwrites for member with equal or higher rank (member highest rank: ${targetHighest}, actor rank: ${actor.highestPosition})`,
          { code: "ROLE_RANK_INSUFFICIENT" },
        );
      }
    }

    // Bounded overwrite cap: prevent unbounded overwrite accumulation (DoS mitigation)
    const existingOverwrites = await this.#repo.getScopeOverwrites(
      ctx.tenantId,
      [dto.scopeId],
      ctx,
    );
    const isNew = !existingOverwrites.some((ow) => ow.targetId === dto.targetId);
    if (isNew && existingOverwrites.length >= 100) {
      throw new BadRequestError(
        "Scope overwrite limit reached (maximum 100 overwrites per scope)",
        {
          code: "SCOPE_OVERWRITE_LIMIT_EXCEEDED",
        },
      );
    }

    const now = new Date().toISOString();
    const overwrite: ScopeOverwrite = {
      id: generateUuidV7(),
      tenantId: ctx.tenantId,
      scopeId: dto.scopeId,
      scopeType: dto.scopeType,
      targetId: dto.targetId,
      targetType: dto.targetType,
      allow: allowRes.value,
      deny: denyRes.value,
      createdAt: now,
      updatedAt: now,
    };

    await this.#repo.setScopeOverwrite(overwrite, ctx);
  }

  async evaluateMemberPermissions(
    memberId: UserId,
    scopeIds: string[] = [],
    ctx: TenantContext,
  ): Promise<MemberEvaluationResult> {
    const roles = await this.#repo.getMemberRoles(ctx.tenantId, memberId, ctx);

    let scopeLevels: ScopeLevel[] | undefined;
    if (scopeIds.length > 0) {
      const overwrites = await this.#repo.getScopeOverwrites(ctx.tenantId, scopeIds, ctx);
      scopeLevels = scopeIds.map((sid) => ({
        scopeId: sid,
        overwrites: overwrites
          .filter((ow) => ow.scopeId === sid)
          .map((ow) => ({
            targetId: ow.targetId,
            type: ow.targetType,
            allow: ow.allow,
            deny: ow.deny,
          })),
      }));
    }

    const effectiveMask = evaluateEffectivePermissions({
      memberId,
      roles: roles.map((r) => ({ id: r.id, permissions: r.permissions })),
      scopes: scopeLevels,
    });

    return {
      effectiveMask,
      effectiveMaskHex: toCanonicalHex(effectiveMask),
      permissions: defaultPermissionRegistry.maskToNames(effectiveMask),
    };
  }
}
