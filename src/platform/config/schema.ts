import { z } from "zod";

/** An integer written as decimal digits, within [min, max]. */
const intString = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, { error: "must be a whole number" })
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

const isOrigin = (value: string): boolean => {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
};

const originList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z.array(
      z.string().refine(isOrigin, {
        error: "each entry must be an absolute http(s) origin such as https://app.example.com",
      }),
    ),
  );

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: intString(1, 65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  HTTP_ADAPTER: z.enum(["express"]).default("express"),
  TRUST_PROXY: intString(0, Number.MAX_SAFE_INTEGER).default(0),
  CORS_ORIGINS: originList.default([]),
  BODY_LIMIT_BYTES: intString(1, 10_485_760).default(1_048_576),
  PUBLIC_DOCS: z
    .stringbool({ truthy: ["true"], falsy: ["false"], case: "sensitive" })
    .default(true),
});

export type Config = z.output<typeof configSchema>;
