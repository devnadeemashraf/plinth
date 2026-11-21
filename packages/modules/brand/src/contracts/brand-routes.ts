import { defineRoute, type RouteContract } from "@plinth/core";
import { brandConfigSchema, updateBrandSchema } from "@plinth/modules-brand/domain/brand.js";

export const getBrandRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/brand",
  summary: "Get Brand Configuration",
  description: "Retrieves the current brand identity, colors, and legal links",
  tags: ["Brand"],
  isPublic: true,
  responseSchemas: {
    200: brandConfigSchema,
  },
});

export const updateBrandRouteContract: RouteContract = defineRoute({
  method: "PUT",
  path: "/api/v1/brand",
  summary: "Update Brand Configuration",
  description: "Updates brand identity and visual theme properties",
  tags: ["Brand"],
  bodySchema: updateBrandSchema,
  responseSchemas: {
    200: brandConfigSchema,
  },
});
