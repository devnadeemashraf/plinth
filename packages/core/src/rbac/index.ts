export {
  addBits,
  bitFromPosition,
  combineBitmasks,
  fromCanonicalHex,
  hasAllBits,
  hasAnyBit,
  hasBit,
  isSubset,
  removeBits,
  toCanonicalHex,
} from "./bitmask.js";
export {
  type EvaluatePermissionsParams,
  evaluateEffectivePermissions,
  hasAnyPermission,
  hasPermission,
  MAX_SCOPE_DEPTH,
  type OverwriteInput,
  type OverwriteType,
  type RoleInput,
  type ScopeLevel,
} from "./evaluator.js";
export {
  type ActorRankContext,
  assertCanManageRole,
  canManageRole,
  type ProposedRoleMutation,
  type TargetRoleData,
} from "./hierarchy.js";
export {
  MAX_ROLE_METADATA_BYTES,
  type RoleMetadata,
  roleMetadataSchema,
  validateRoleMetadata,
} from "./metadata.js";
export {
  ADMINISTRATOR_BIT,
  CORE_PERMISSIONS,
  type CorePermissionName,
  defaultPermissionRegistry,
  type PermissionDefinition,
  PermissionRegistry,
} from "./registry.js";
