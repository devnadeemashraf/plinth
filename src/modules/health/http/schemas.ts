import { z } from "zod";

export const livenessSchema = z.strictObject({ status: z.literal("ok") });

export const readySchema = z.strictObject({
  status: z.literal("ready"),
  checks: z.record(z.string(), z.literal("ok")),
});

export const unreadySchema = z.strictObject({
  status: z.literal("unready"),
  failing: z.array(z.string()),
});
