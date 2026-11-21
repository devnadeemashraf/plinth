import { defineRoute, type RouteContract } from "@plinth/core";
import {
  createTenantSchema,
  tenantSchema,
  tenantSlugParamSchema,
  updateTenantSchema,
} from "@plinth/modules-tenants/domain/tenant.js";

export const getTenantRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/tenants/:slug",
  summary: "Get Tenant By Slug",
  description: "Retrieves metadata and quota configuration for a given tenant organization",
  tags: ["Tenants"],
  paramsSchema: tenantSlugParamSchema,
  responseSchemas: {
    200: tenantSchema,
  },
});

export const createTenantRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/tenants",
  summary: "Create Tenant",
  description: "Provisions a new tenant organization with custom slug and subscription plan",
  tags: ["Tenants"],
  bodySchema: createTenantSchema,
  responseSchemas: {
    201: tenantSchema,
  },
});

export const updateTenantRouteContract: RouteContract = defineRoute({
  method: "PATCH",
  path: "/api/v1/tenants/:slug",
  summary: "Update Tenant",
  description: "Updates tenant organization profile, subscription plan, quota, or status",
  tags: ["Tenants"],
  paramsSchema: tenantSlugParamSchema,
  bodySchema: updateTenantSchema,
  responseSchemas: {
    200: tenantSchema,
  },
});
