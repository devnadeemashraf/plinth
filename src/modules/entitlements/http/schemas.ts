import { z } from "zod";

const planAudienceSchema = z.enum(["user", "tenant"]);

/** A plan as clients see it: never its internal `id` or timestamps. */
export const planSchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  audience: planAudienceSchema,
  isDefault: z.boolean(),
  sort: z.int(),
});

export const planListSchema = z.strictObject({
  data: z.array(planSchema),
  nextCursor: z.null(),
});

export const listPlansQuerySchema = z.strictObject({
  audience: planAudienceSchema.optional(),
});

export const planParamsSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
});
