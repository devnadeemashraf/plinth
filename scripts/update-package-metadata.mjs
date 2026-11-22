import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..");
const packagesDir = join(repoRoot, "packages");

const descriptions = {
  "@plinth/core": "Core hexagonal kernel primitives, ports, telemetry, dual-layer PII redaction, and fitness scanner for Plinth.",
  "@plinth/cli": "Scaffolding CLI for generating production-ready hexagonal TypeScript services.",
  "@plinth/contract-tests": "Shared black-box contract test suites verifying compliance across all swappable Plinth port adapters.",
  "@plinth/modules-admin": "Zero-build SSR HTML5/CSS administrative dashboard with strict CSP, CSRF, and CIDR fencing.",
  "@plinth/modules-audit": "Append-only structured audit logging with automatic PII masking.",
  "@plinth/modules-auth": "Dual session lifecycle, Argon2id passwords, and asymmetric Ed25519 JWT auth module.",
  "@plinth/modules-billing": "Universal billing module supporting Stripe, Razorpay, webhooks, and entitlement tracking.",
  "@plinth/modules-brand": "Tenant-aware branding customization module.",
  "@plinth/modules-compliance": "GDPR and India DPDP consent ledger with data portability and right-to-erasure.",
  "@plinth/modules-config-store": "Dynamic AES-256-GCM envelope-encrypted runtime configuration store.",
  "@plinth/modules-rbac": "Discord-style BigInt bitmask role-based access control engine.",
  "@plinth/modules-tenants": "Branded compile-time multi-tenant organization lifecycle management.",
  "@plinth/modules-users": "User profile management with magic-byte verified avatar upload.",
  "@plinth/adapter-analytics-stub": "Privacy-preserving scrubbed analytics adapter stub.",
  "@plinth/adapter-billing-razorpay": "Razorpay payment and subscription adapter with INR/UPI/GST support.",
  "@plinth/adapter-billing-stripe": "Stripe payment and subscription lifecycle adapter.",
  "@plinth/adapter-billing-stub": "Local billing and checkout simulation adapter.",
  "@plinth/adapter-cache-memory": "High-performance bounded in-memory LRU cache adapter.",
  "@plinth/adapter-cache-redis": "Distributed Redis cache adapter with fail-open circuit breaking.",
  "@plinth/adapter-db-mysql": "MySQL 2 database adapter with connection pooling and schema migrations.",
  "@plinth/adapter-db-postgres": "PostgreSQL database adapter with Row-Level Security (RLS) tenant isolation.",
  "@plinth/adapter-db-sqlite": "High-performance SQLite database adapter with WAL mode.",
  "@plinth/adapter-email-smtp": "Secure SMTP email transport adapter.",
  "@plinth/adapter-email-stub": "Local HTML email catcher and inspector adapter.",
  "@plinth/adapter-http-express": "Modern Express 5 HTTP server adapter.",
  "@plinth/adapter-http-fastify": "High-performance Fastify 5 HTTP server adapter.",
  "@plinth/adapter-queue-bullmq": "Redis-backed distributed BullMQ queue adapter with exponential backoff and DLQ.",
  "@plinth/adapter-queue-db": "Database-backed polling queue adapter with transactional outbox support.",
  "@plinth/adapter-storage-local": "Local filesystem storage adapter with magic-byte inspection.",
  "@plinth/adapter-storage-s3": "AWS S3 and S3-compatible cloud object storage adapter with SigV4 pre-signing.",
};

function findPackages(dir) {
  const pkgs = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      const pkgPath = join(fullPath, "package.json");
      if (existsSync(pkgPath)) {
        pkgs.push(fullPath);
      }
      pkgs.push(...findPackages(fullPath));
    }
  }

  return [...new Set(pkgs)];
}

const packageDirs = findPackages(packagesDir);
console.log(`Found ${packageDirs.length} packages in packages/`);

for (const dir of packageDirs) {
  const pkgPath = join(dir, "package.json");
  const relDir = relative(repoRoot, dir).replace(/\\/g, "/");
  const raw = readFileSync(pkgPath, "utf-8").replace(/^\uFEFF/, "");
  const pkg = JSON.parse(raw);

  const desc = descriptions[pkg.name] || `Plinth package: ${pkg.name}`;

  const updated = {
    name: pkg.name,
    version: pkg.version || "1.0.0",
    description: desc,
    license: "MIT",
    author: "Plinth Contributors",
    homepage: "https://plinth-ts.github.io/plinth",
    repository: {
      type: "git",
      url: "https://github.com/plinth-ts/plinth.git",
      directory: relDir,
    },
    bugs: {
      url: "https://github.com/plinth-ts/plinth/issues",
    },
    keywords: [
      "typescript",
      "backend",
      "hexagonal-architecture",
      "plinth",
      "microservices",
      "framework",
      "clean-architecture",
    ],
    type: pkg.type || "module",
    ...pkg,
    description: desc,
    license: "MIT",
    author: "Plinth Contributors",
    homepage: "https://plinth-ts.github.io/plinth",
    repository: {
      type: "git",
      url: "https://github.com/plinth-ts/plinth.git",
      directory: relDir,
    },
    bugs: {
      url: "https://github.com/plinth-ts/plinth/issues",
    },
  };

  writeFileSync(pkgPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  console.log(`Updated ${pkg.name} -> ${relDir}`);
}
