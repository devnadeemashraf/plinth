import type { TenantId, TenantQuota } from "@plinth/core";
import { z } from "zod";

export type { TenantQuota };

export type TenantPlan = "free" | "pro" | "enterprise";
export type TenantStatus = "active" | "suspended" | "archived";

export interface Tenant {
  readonly id: TenantId;
  readonly slug: string;
  readonly name: string;
  readonly plan: TenantPlan;
  readonly status: TenantStatus;
  readonly quota?: TenantQuota | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateTenantDto {
  readonly slug: string;
  readonly name: string;
  readonly plan?: TenantPlan | undefined;
  readonly quota?: TenantQuota | undefined;
}

export interface UpdateTenantDto {
  readonly name?: string | undefined;
  readonly plan?: TenantPlan | undefined;
  readonly status?: TenantStatus | undefined;
  readonly quota?: TenantQuota | undefined;
}

export const tenantPlanSchema = z.enum(["free", "pro", "enterprise"]);
export const tenantStatusSchema = z.enum(["active", "suspended", "archived"]);

export const tenantQuotaSchema = z
  .object({
    maxUsers: z.number().int().positive().optional(),
    maxStorageBytes: z.number().int().positive().optional(),
    rateLimitRpm: z.number().int().positive().optional(),
  })
  .strict();

export const createTenantSchema = z
  .object({
    slug: z
      .string()
      .min(1, { message: "Slug must be at least 1 character" })
      .max(63, { message: "Slug cannot exceed 63 characters" })
      .regex(/^[a-z0-9_-]+$/i, {
        message: "Slug must contain only alphanumeric characters, underscores, or hyphens",
      }),
    name: z
      .string()
      .min(1, { message: "Name must be at least 1 character" })
      .max(100, { message: "Name cannot exceed 100 characters" }),
    plan: tenantPlanSchema.default("free"),
    quota: tenantQuotaSchema.optional(),
  })
  .strict();

export const updateTenantSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    plan: tenantPlanSchema.optional(),
    status: tenantStatusSchema.optional(),
    quota: tenantQuotaSchema.optional(),
  })
  .strict();

export const tenantSlugParamSchema = z
  .object({
    slug: z.string().min(1).max(63),
  })
  .strict();

export const tenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  plan: tenantPlanSchema,
  status: tenantStatusSchema,
  quota: tenantQuotaSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
