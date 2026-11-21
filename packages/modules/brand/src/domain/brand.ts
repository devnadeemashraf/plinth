import { z } from "zod";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const HTTP_URL_REGEX = /^https?:\/\/.+/;

export const brandConfigSchema = z.strictObject({
  name: z.string().min(1).max(100),
  tagline: z.string().max(200).default(""),
  primaryColorHex: z.string().regex(HEX_COLOR_REGEX, "Must be a 6-digit hex color like #4f46e5"),
  secondaryColorHex: z.string().regex(HEX_COLOR_REGEX, "Must be a 6-digit hex color like #06b6d4"),
  accentColorHex: z.string().regex(HEX_COLOR_REGEX, "Must be a 6-digit hex color like #f59e0b"),
  logoUrlLight: z
    .string()
    .regex(HTTP_URL_REGEX, "Must be an HTTP/HTTPS URL")
    .default("https://plinth.dev/logo-light.svg"),
  logoUrlDark: z
    .string()
    .regex(HTTP_URL_REGEX, "Must be an HTTP/HTTPS URL")
    .default("https://plinth.dev/logo-dark.svg"),
  faviconUrl: z
    .string()
    .regex(HTTP_URL_REGEX, "Must be an HTTP/HTTPS URL")
    .default("https://plinth.dev/favicon.ico"),
  supportEmail: z.string().email("Must be a valid email address"),
  legalTermsUrl: z
    .string()
    .regex(HTTP_URL_REGEX, "Must be an HTTP/HTTPS URL")
    .default("https://plinth.dev/terms"),
  legalPrivacyUrl: z
    .string()
    .regex(HTTP_URL_REGEX, "Must be an HTTP/HTTPS URL")
    .default("https://plinth.dev/privacy"),
  emailFooterHtml: z.string().default("<p>Sent by Plinth</p>"),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;

export const updateBrandSchema = brandConfigSchema.partial().strict();

export type UpdateBrandDto = z.infer<typeof updateBrandSchema>;

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  name: "Plinth",
  tagline: "The Modern Production TypeScript Backend Platform",
  primaryColorHex: "#4f46e5",
  secondaryColorHex: "#06b6d4",
  accentColorHex: "#f59e0b",
  logoUrlLight: "https://plinth.dev/logo-light.svg",
  logoUrlDark: "https://plinth.dev/logo-dark.svg",
  faviconUrl: "https://plinth.dev/favicon.ico",
  supportEmail: "support@plinth.dev",
  legalTermsUrl: "https://plinth.dev/terms",
  legalPrivacyUrl: "https://plinth.dev/privacy",
  emailFooterHtml: "<p>© Plinth. All rights reserved.</p>",
};

export function mergeBrandConfig(current: BrandConfig, patch: UpdateBrandDto): BrandConfig {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
