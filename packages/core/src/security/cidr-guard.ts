import { BlockList, isIP } from "node:net";

const blockListCache = new Map<string, BlockList>();

function compileBlockList(cidrs: readonly string[]): BlockList {
  const cacheKey = cidrs.join(",");
  const existing = blockListCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const blockList = new BlockList();

  for (const rawEntry of cidrs) {
    const entry = rawEntry.trim();
    if (!entry) {
      continue;
    }

    try {
      if (entry.includes("/")) {
        const [ipPart, prefixPart] = entry.split("/");
        if (!ipPart || !prefixPart) {
          continue;
        }
        const ip = ipPart.trim();
        const prefix = Number.parseInt(prefixPart.trim(), 10);
        if (Number.isNaN(prefix)) {
          continue;
        }

        const family = isIP(ip);
        if (family === 4 && prefix >= 0 && prefix <= 32) {
          blockList.addSubnet(ip, prefix, "ipv4");
        } else if (family === 6 && prefix >= 0 && prefix <= 128) {
          blockList.addSubnet(ip, prefix, "ipv6");
        }
      } else {
        const family = isIP(entry);
        if (family === 4) {
          blockList.addAddress(entry, "ipv4");
        } else if (family === 6) {
          blockList.addAddress(entry, "ipv6");
        }
      }
    } catch {
      // Ignore malformed entries gracefully
    }
  }

  // Bound cache size to prevent unbounded memory growth
  if (blockListCache.size >= 100) {
    blockListCache.clear();
  }

  blockListCache.set(cacheKey, blockList);
  return blockList;
}

/**
 * Normalizes an incoming client IP address:
 * - Trims whitespace
 * - Strips enclosing brackets for IPv6 literals (e.g. `[::1]` -> `::1`)
 * - Strips trailing port for IPv4 addresses (e.g. `127.0.0.1:8080` -> `127.0.0.1`)
 * - Unwraps IPv4-mapped IPv6 addresses (e.g. `::ffff:127.0.0.1` -> `127.0.0.1`)
 */
function normalizeClientIp(rawIp: string): { ip: string; family: "ipv4" | "ipv6" } | null {
  let cleaned = rawIp.trim();

  // Strip enclosing brackets from IPv6
  if (cleaned.startsWith("[") && cleaned.includes("]")) {
    cleaned = cleaned.slice(1, cleaned.indexOf("]"));
  }

  // Strip trailing port for IPv4 (e.g. 192.168.1.1:8080)
  if (cleaned.includes(".") && cleaned.includes(":")) {
    // Check if it's an IPv4 with port or IPv4-mapped IPv6
    if (!cleaned.toLowerCase().includes("::ffff:")) {
      const parts = cleaned.split(":");
      if (parts.length === 2 && isIP(parts[0] ?? "") === 4) {
        cleaned = parts[0] ?? "";
      }
    }
  }

  // Unwrap IPv4-mapped IPv6 (::ffff:127.0.0.1)
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("::ffff:") || lower.startsWith("::ffff:0:")) {
    const embeddedIpv4 = cleaned.slice(cleaned.lastIndexOf(":") + 1);
    if (isIP(embeddedIpv4) === 4) {
      return { ip: embeddedIpv4, family: "ipv4" };
    }
  }

  const family = isIP(cleaned);
  if (family === 4) {
    return { ip: cleaned, family: "ipv4" };
  }
  if (family === 6) {
    return { ip: cleaned, family: "ipv6" };
  }

  return null;
}

/**
 * Checks whether an incoming client IP address is allowed by the given CIDR list.
 *
 * If allowedCidrs is empty, access is unrestricted and returns true.
 * If clientIp is missing or invalid, returns false.
 */
export function isIpAllowedByCidrs(
  clientIp: string | undefined,
  allowedCidrs: readonly string[],
): boolean {
  if (allowedCidrs.length === 0) {
    return true;
  }

  if (!clientIp || typeof clientIp !== "string") {
    return false;
  }

  const normalized = normalizeClientIp(clientIp);
  if (!normalized) {
    return false;
  }

  const blockList = compileBlockList(allowedCidrs);
  return blockList.check(normalized.ip, normalized.family);
}
