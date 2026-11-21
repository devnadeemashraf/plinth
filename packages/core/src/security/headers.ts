export interface SecurityHeaderOptions {
  readonly isProduction?: boolean | undefined;
  readonly customCsp?: string | undefined;
  readonly hstsMaxAgeSeconds?: number | undefined;
}

export function getSecurityHeaders(options?: SecurityHeaderOptions): Record<string, string> {
  const isProd = options?.isProduction ?? false;
  const hstsAge = options?.hstsMaxAgeSeconds ?? 31_536_000; // 1 year

  const csp =
    options?.customCsp ??
    "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; script-src 'self';";

  const headers: Record<string, string> = {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };

  if (isProd) {
    headers["strict-transport-security"] = `max-age=${hstsAge}; includeSubDomains; preload`;
  }

  return headers;
}
