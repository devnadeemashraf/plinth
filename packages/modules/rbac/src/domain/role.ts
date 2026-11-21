import type { RoleId, RoleMetadata, TenantId, UserId } from "@plinth/core";

export interface Role {
  readonly id: RoleId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly permissions: bigint;
  readonly position: number;
  readonly isSystem: boolean;
  readonly metadata?: RoleMetadata | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateRoleDto {
  readonly name: string;
  readonly permissionsHex: string;
  readonly position: number;
  readonly isSystem?: boolean | undefined;
  readonly metadata?: RoleMetadata | undefined;
}

export interface UpdateRoleDto {
  readonly name?: string | undefined;
  readonly permissionsHex?: string | undefined;
  readonly position?: number | undefined;
  readonly metadata?: RoleMetadata | undefined;
}

export interface RoleAssignment {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly memberId: UserId;
  readonly roleId: RoleId;
  readonly assignedAt: string;
}

export type ScopeOverwriteType = "everyone" | "role" | "member";

export interface ScopeOverwrite {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly scopeId: string;
  readonly scopeType: string;
  readonly targetId: string;
  readonly targetType: ScopeOverwriteType;
  readonly allow: bigint;
  readonly deny: bigint;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SetScopeOverwriteDto {
  readonly scopeId: string;
  readonly scopeType: string;
  readonly targetId: string;
  readonly targetType: ScopeOverwriteType;
  readonly allowHex: string;
  readonly denyHex: string;
}
