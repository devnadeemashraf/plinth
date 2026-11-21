import dns from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { AppError } from "@/errors/app-error.js";

const ssrfBlockList = new BlockList();

// IPv4 Restricted Subnets
ssrfBlockList.addSubnet("0.0.0.0", 8, "ipv4"); // Current network
ssrfBlockList.addSubnet("127.0.0.0", 8, "ipv4"); // Loopback
ssrfBlockList.addSubnet("10.0.0.0", 8, "ipv4"); // Private RFC 1918
ssrfBlockList.addSubnet("172.16.0.0", 12, "ipv4"); // Private RFC 1918
ssrfBlockList.addSubnet("192.168.0.0", 16, "ipv4"); // Private RFC 1918
ssrfBlockList.addSubnet("100.64.0.0", 10, "ipv4"); // Carrier-grade NAT RFC 6598
ssrfBlockList.addSubnet("169.254.0.0", 16, "ipv4"); // Link-local / Cloud metadata
ssrfBlockList.addSubnet("198.18.0.0", 15, "ipv4"); // Benchmarking RFC 2544
ssrfBlockList.addSubnet("198.51.100.0", 24, "ipv4"); // Documentation TEST-NET-2
ssrfBlockList.addSubnet("203.0.113.0", 24, "ipv4"); // Documentation TEST-NET-3
ssrfBlockList.addSubnet("224.0.0.0", 4, "ipv4"); // Multicast
ssrfBlockList.addSubnet("240.0.0.0", 4, "ipv4"); // Reserved RFC 1112
ssrfBlockList.addAddress("255.255.255.255", "ipv4"); // Broadcast

// IPv6 Restricted Subnets
ssrfBlockList.addAddress("::", "ipv6"); // Unspecified
ssrfBlockList.addAddress("::1", "ipv6"); // Loopback
ssrfBlockList.addSubnet("fc00::", 7, "ipv6"); // Unique Local Unicast RFC 4193
ssrfBlockList.addSubnet("fe80::", 10, "ipv6"); // Link-local unicast RFC 4291
ssrfBlockList.addSubnet("ff00::", 8, "ipv6"); // Multicast
ssrfBlockList.addSubnet("2001:db8::", 32, "ipv6"); // Documentation RFC 3849

export function isIpBlocked(ipAddress: string): boolean {
  const cleanIp =
    ipAddress.startsWith("[") && ipAddress.endsWith("]") ? ipAddress.slice(1, -1) : ipAddress;
  const family = isIP(cleanIp);
  if (family === 0) {
    return true; // Malformed IP is treated as blocked/unsafe
  }

  // Handle IPv4-mapped IPv6 address notation (e.g. ::ffff:127.0.0.1)
  if (family === 6 && cleanIp.toLowerCase().startsWith("::ffff:")) {
    const embeddedIpv4 = cleanIp.slice(7);
    if (isIP(embeddedIpv4) === 4) {
      return ssrfBlockList.check(embeddedIpv4, "ipv4");
    }
  }

  const type = family === 4 ? "ipv4" : "ipv6";
  return ssrfBlockList.check(cleanIp, type);
}

export interface SsrfValidationResult {
  readonly safe: boolean;
  readonly url: URL;
  readonly resolvedIps: readonly string[];
  readonly error?: string | undefined;
}

export interface SsrfValidationOptions {
  readonly allowedHosts?: readonly string[] | undefined;
  readonly allowedProtocols?: readonly string[] | undefined;
}

export async function validateUrlForEgress(
  rawUrl: string,
  options?: SsrfValidationOptions,
): Promise<SsrfValidationResult> {
  const allowedProtocols = options?.allowedProtocols ?? ["http:", "https:"];

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      safe: false,
      url: new URL("http://localhost"),
      resolvedIps: [],
      error: "Malformed URL",
    };
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      safe: false,
      url: parsed,
      resolvedIps: [],
      error: `Unsupported protocol '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`,
    };
  }

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  // Explicit loopback hostname check
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return {
      safe: false,
      url: parsed,
      resolvedIps: ["127.0.0.1"],
      error: "Restricted hostname: localhost access is blocked",
    };
  }

  // If host is explicitly an IP literal
  if (isIP(hostname) !== 0) {
    if (isIpBlocked(hostname)) {
      return {
        safe: false,
        url: parsed,
        resolvedIps: [hostname],
        error: `Restricted IP address: '${hostname}' is in a private, loopback, or metadata range.`,
      };
    }
    return {
      safe: true,
      url: parsed,
      resolvedIps: [hostname],
    };
  }

  // Allowlist override (if provided)
  if (options?.allowedHosts?.includes(hostname)) {
    return {
      safe: true,
      url: parsed,
      resolvedIps: [],
    };
  }

  // DNS Resolution check for domain names
  try {
    const lookups = await dns.lookup(hostname, { all: true });
    const resolvedIps = lookups.map((l) => l.address);

    if (resolvedIps.length === 0) {
      return {
        safe: false,
        url: parsed,
        resolvedIps: [],
        error: "DNS resolution failed: no IP records found for host",
      };
    }

    for (const ip of resolvedIps) {
      if (isIpBlocked(ip)) {
        return {
          safe: false,
          url: parsed,
          resolvedIps,
          error: `Restricted destination: '${hostname}' resolved to blocked IP '${ip}'.`,
        };
      }
    }

    return {
      safe: true,
      url: parsed,
      resolvedIps,
    };
  } catch (err) {
    return {
      safe: false,
      url: parsed,
      resolvedIps: [],
      error: `DNS resolution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export class SsrfBlockedError extends AppError {
  constructor(message = "Outbound request was blocked by SSRF egress guard") {
    super(403, message, {
      code: "SSRF_BLOCKED",
      title: "SSRF Egress Blocked",
      detail: message,
    });
  }
}
