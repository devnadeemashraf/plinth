import { defineRoute, type RouteContract, roleMetadataSchema } from "@plinth/core";
import { z } from "zod";

const hexMaskSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]+$/i, "Invalid canonical hex bitmask (must start with 0x)");

export const roleResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  permissionsHex: hexMaskSchema,
  position: z.number().int().min(0),
  isSystem: z.boolean(),
  metadata: roleMetadataSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRoleRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/roles",
  summary: "Create a new role",
  description:
    "Creates a new role within the active tenant, enforcing rank hierarchy and anti-escalation constraints.",
  tags: ["RBAC"],
  bodySchema: z.strictObject({
    name: z.string().trim().min(1).max(64),
    permissionsHex: hexMaskSchema,
    position: z.number().int().min(0).max(10_000),
    metadata: roleMetadataSchema.optional(),
  }),
  responseSchemas: {
    201: roleResponseSchema,
  },
});

export const getRoleRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/roles/:roleId",
  summary: "Get role by ID",
  description: "Retrieves a role by its unique identifier within the active tenant.",
  tags: ["RBAC"],
  paramsSchema: z.strictObject({
    roleId: z.string().trim().min(1),
  }),
  responseSchemas: {
    200: roleResponseSchema,
  },
});

export const updateRoleRouteContract: RouteContract = defineRoute({
  method: "PATCH",
  path: "/api/v1/roles/:roleId",
  summary: "Update an existing role",
  description:
    "Updates role name, position, permissions, or metadata under rank anti-escalation invariants.",
  tags: ["RBAC"],
  paramsSchema: z.strictObject({
    roleId: z.string().trim().min(1),
  }),
  bodySchema: z.strictObject({
    name: z.string().trim().min(1).max(64).optional(),
    permissionsHex: hexMaskSchema.optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    metadata: roleMetadataSchema.optional(),
  }),
  responseSchemas: {
    200: roleResponseSchema,
  },
});

export const deleteRoleRouteContract: RouteContract = defineRoute({
  method: "DELETE",
  path: "/api/v1/roles/:roleId",
  summary: "Delete role",
  description: "Permanently deletes a custom role. System roles cannot be deleted.",
  tags: ["RBAC"],
  paramsSchema: z.strictObject({
    roleId: z.string().trim().min(1),
  }),
  responseSchemas: {
    204: z.undefined(),
  },
});

export const listRolesRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/roles",
  summary: "List all tenant roles",
  description:
    "Returns all roles defined for the current tenant ordered by rank position descending.",
  tags: ["RBAC"],
  responseSchemas: {
    200: z.array(roleResponseSchema),
  },
});

export const assignRoleRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/members/:memberId/roles",
  summary: "Assign role to member",
  description: "Assigns a tenant role to a member under rank anti-escalation checks.",
  tags: ["RBAC"],
  paramsSchema: z.strictObject({
    memberId: z.string().trim().min(1),
  }),
  bodySchema: z.strictObject({
    roleId: z.string().trim().min(1),
  }),
  responseSchemas: {
    200: z.object({
      assigned: z.literal(true),
    }),
  },
});

export const removeRoleRouteContract: RouteContract = defineRoute({
  method: "DELETE",
  path: "/api/v1/members/:memberId/roles/:roleId",
  summary: "Remove role from member",
  description: "Revokes a role assignment from a member.",
  tags: ["RBAC"],
  paramsSchema: z.strictObject({
    memberId: z.string().trim().min(1),
    roleId: z.string().trim().min(1),
  }),
  responseSchemas: {
    204: z.undefined(),
  },
});

export const evaluatePermissionsRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/rbac/evaluate",
  summary: "Evaluate member effective permissions",
  description:
    "Calculates effective O(1) BigInt permissions for a member taking into account assigned roles and hierarchical scope overwrites.",
  tags: ["RBAC"],
  bodySchema: z.strictObject({
    memberId: z.string().trim().min(1),
    scopeIds: z.array(z.string().trim().min(1)).max(4).optional(),
  }),
  responseSchemas: {
    200: z.object({
      memberId: z.string(),
      effectiveMaskHex: hexMaskSchema,
      permissions: z.array(z.string()),
    }),
  },
});
