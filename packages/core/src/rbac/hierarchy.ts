import { ForbiddenError } from "@/errors/app-error.js";
import { err, isErr, ok, type Result } from "@/primitives/result.js";
import { hasBit, isSubset } from "@/rbac/bitmask.js";
import { ADMINISTRATOR_BIT } from "@/rbac/registry.js";

export interface ActorRankContext {
  readonly userId: string;
  readonly highestPosition: number;
  readonly effectivePermissions: bigint;
}

export interface TargetRoleData {
  readonly id?: string | undefined;
  readonly position: number;
  readonly permissions: bigint;
}

export interface ProposedRoleMutation {
  readonly position?: number | undefined;
  readonly permissions?: bigint | undefined;
}

/**
 * Validates the Discord-style Rank Hierarchy and Anti-Escalation Invariants:
 * 1. actorHighestPosition > targetRole.position (Strictly greater! Cannot touch equal or higher rank).
 * 2. If mutating position: actorHighestPosition > proposedPosition.
 * 3. Subset check: target permissions and proposed permissions must be a subset of actor permissions,
 *    unless the actor holds ADMINISTRATOR.
 *
 * Even an Administrator CANNOT manage or edit a role with an equal or higher numeric position!
 */
export function canManageRole(
  actor: ActorRankContext,
  targetRole: TargetRoleData,
  newRoleData?: ProposedRoleMutation | undefined,
): Result<void, ForbiddenError> {
  // 1. Strict rank comparison on target role
  if (actor.highestPosition <= targetRole.position) {
    return err(
      new ForbiddenError(
        `Cannot manage role of equal or higher position: actor position (${actor.highestPosition}) must be strictly greater than target role position (${targetRole.position})`,
        { code: "ROLE_RANK_INSUFFICIENT" },
      ),
    );
  }

  // 2. Strict rank comparison on proposed new position
  if (newRoleData?.position !== undefined && actor.highestPosition <= newRoleData.position) {
    return err(
      new ForbiddenError(
        `Cannot elevate role position: proposed position (${newRoleData.position}) must be strictly lower than actor position (${actor.highestPosition})`,
        { code: "ROLE_RANK_INSUFFICIENT" },
      ),
    );
  }

  // 3. Anti-escalation subset check
  const hasAdmin = hasBit(actor.effectivePermissions, ADMINISTRATOR_BIT);

  if (!hasAdmin) {
    // Target role's existing permissions must be held by actor
    if (!isSubset(targetRole.permissions, actor.effectivePermissions)) {
      return err(
        new ForbiddenError(
          "Cannot manage role with permissions not held by actor (privilege escalation blocked)",
          { code: "PRIVILEGE_ESCALATION" },
        ),
      );
    }

    // Proposed new permissions must be held by actor
    if (
      newRoleData?.permissions !== undefined &&
      !isSubset(newRoleData.permissions, actor.effectivePermissions)
    ) {
      return err(
        new ForbiddenError(
          "Cannot grant permissions not held by actor (privilege escalation blocked)",
          { code: "PRIVILEGE_ESCALATION" },
        ),
      );
    }
  }

  return ok(undefined);
}

/**
 * Asserts that actor can manage target role, throwing ForbiddenError on failure.
 */
export function assertCanManageRole(
  actor: ActorRankContext,
  targetRole: TargetRoleData,
  newRoleData?: ProposedRoleMutation | undefined,
): void {
  const result = canManageRole(actor, targetRole, newRoleData);
  if (isErr(result)) {
    throw result.error;
  }
}
