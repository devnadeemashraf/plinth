import { BadRequestError } from "@/errors/app-error.js";
import type { RoleId, UserId } from "@/primitives/brand-types.js";
import { hasBit } from "@/rbac/bitmask.js";
import { ADMINISTRATOR_BIT } from "@/rbac/registry.js";

export type OverwriteType = "everyone" | "role" | "member";

export interface RoleInput {
  readonly id: RoleId;
  readonly permissions: bigint;
}

export interface OverwriteInput {
  readonly targetId: string;
  readonly type: OverwriteType;
  readonly allow: bigint;
  readonly deny: bigint;
}

export interface ScopeLevel {
  readonly scopeId: string;
  readonly overwrites: readonly OverwriteInput[];
}

export interface EvaluatePermissionsParams {
  readonly memberId: UserId;
  readonly roles: readonly RoleInput[];
  readonly scopes?: readonly ScopeLevel[] | undefined;
}

/**
 * Maximum permitted hierarchical resource scope depth.
 * Exceeding 4 levels throws BadRequestError with code SCOPE_DEPTH_EXCEEDED.
 */
export const MAX_SCOPE_DEPTH = 4;

/**
 * Evaluates effective permissions for a member using Discord's O(1) bitmask overwrite algorithm.
 *
 * Sequence:
 * 1. Base permissions: union of all assigned tenant roles.
 * 2. ADMINISTRATOR short-circuit: if base contains ADMINISTRATOR, immediately bypasses all overwrites.
 * 3. Scope overwrites (depth <= 4):
 *    a. @everyone deny / allow
 *    b. Role denies / allows (combined across all user's held roles)
 *    c. Member-specific deny / allow
 */
export function evaluateEffectivePermissions(params: EvaluatePermissionsParams): bigint {
  let mask = 0n;
  for (const role of params.roles) {
    mask |= role.permissions;
  }

  // ADMINISTRATOR short-circuit: unconditional bypass of all overwrites
  if (hasBit(mask, ADMINISTRATOR_BIT)) {
    return mask;
  }

  const scopes = params.scopes;
  if (!scopes || scopes.length === 0) {
    return mask;
  }

  if (scopes.length > MAX_SCOPE_DEPTH) {
    throw new BadRequestError(
      `Resource scope depth cannot exceed ${MAX_SCOPE_DEPTH} levels. Received ${scopes.length}.`,
      { code: "SCOPE_DEPTH_EXCEEDED" },
    );
  }

  const memberIdStr = String(params.memberId);
  const heldRoleIds = new Set(params.roles.map((r) => String(r.id)));

  for (const scope of scopes) {
    if (hasBit(mask, ADMINISTRATOR_BIT)) {
      return mask;
    }

    // 1. @everyone overwrite
    const everyoneOw = scope.overwrites.find(
      (ow) => ow.type === "everyone" || ow.targetId === "@everyone",
    );
    if (everyoneOw) {
      mask = (mask & ~everyoneOw.deny) | everyoneOw.allow;
    }

    // 2. Roles overwrites (combined across all held roles)
    let rolesDeny = 0n;
    let rolesAllow = 0n;
    for (const ow of scope.overwrites) {
      if (ow.type === "role" && heldRoleIds.has(ow.targetId)) {
        rolesDeny |= ow.deny;
        rolesAllow |= ow.allow;
      }
    }
    mask = (mask & ~rolesDeny) | rolesAllow;

    // 3. Member-specific overwrite
    const memberOw = scope.overwrites.find(
      (ow) => ow.type === "member" && ow.targetId === memberIdStr,
    );
    if (memberOw) {
      mask = (mask & ~memberOw.deny) | memberOw.allow;
    }
  }

  return mask;
}

/**
 * Checks whether the effective permission mask satisfies all required permissions.
 * Short-circuits to true if ADMINISTRATOR bit is set.
 */
export function hasPermission(effectiveMask: bigint, required: bigint): boolean {
  if (hasBit(effectiveMask, ADMINISTRATOR_BIT)) {
    return true;
  }
  return (effectiveMask & required) === required;
}

/**
 * Checks whether the effective permission mask satisfies at least one required permission.
 * Short-circuits to true if ADMINISTRATOR bit is set.
 */
export function hasAnyPermission(effectiveMask: bigint, required: bigint): boolean {
  if (hasBit(effectiveMask, ADMINISTRATOR_BIT)) {
    return true;
  }
  return (effectiveMask & required) !== 0n;
}
