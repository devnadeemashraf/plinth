import { z } from "zod";

export const addOptionsSchema = z.strictObject({
  type: z.enum(["adapter", "module"]),
  name: z.string().min(1, "Name cannot be empty"),
  projectDir: z.string().optional(),
});

export type AddOptions = z.infer<typeof addOptionsSchema>;

export interface AddResult {
  readonly success: boolean;
  readonly packageName: string;
  readonly installCommand: string;
  readonly snippet: string;
}

const ADAPTER_MAP: Record<string, { packageName: string; snippet: string }> = {
  fastify: {
    packageName: "@plinth/adapter-http-fastify",
    snippet: 'import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";',
  },
  express: {
    packageName: "@plinth/adapter-http-express",
    snippet: 'import { ExpressHttpAdapter } from "@plinth/adapter-http-express";',
  },
  sqlite: {
    packageName: "@plinth/adapter-db-sqlite",
    snippet: 'import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";',
  },
  postgres: {
    packageName: "@plinth/adapter-db-postgres",
    snippet: 'import { PostgresDatabaseAdapter } from "@plinth/adapter-db-postgres";',
  },
  mysql: {
    packageName: "@plinth/adapter-db-mysql",
    snippet: 'import { MysqlDatabaseAdapter } from "@plinth/adapter-db-mysql";',
  },
  memory: {
    packageName: "@plinth/adapter-cache-memory",
    snippet: 'import { MemoryCacheAdapter } from "@plinth/adapter-cache-memory";',
  },
  redis: {
    packageName: "@plinth/adapter-cache-redis",
    snippet: 'import { RedisCacheAdapter } from "@plinth/adapter-cache-redis";',
  },
  db: {
    packageName: "@plinth/adapter-queue-db",
    snippet: 'import { DbQueueAdapter } from "@plinth/adapter-queue-db";',
  },
  bullmq: {
    packageName: "@plinth/adapter-queue-bullmq",
    snippet: 'import { BullMqQueueAdapter } from "@plinth/adapter-queue-bullmq";',
  },
  local: {
    packageName: "@plinth/adapter-storage-local",
    snippet: 'import { LocalStorageAdapter } from "@plinth/adapter-storage-local";',
  },
  s3: {
    packageName: "@plinth/adapter-storage-s3",
    snippet: 'import { S3StorageAdapter } from "@plinth/adapter-storage-s3";',
  },
  stub: {
    packageName: "@plinth/adapter-email-stub",
    snippet: 'import { StubEmailAdapter } from "@plinth/adapter-email-stub";',
  },
  smtp: {
    packageName: "@plinth/adapter-email-smtp",
    snippet: 'import { SmtpEmailAdapter } from "@plinth/adapter-email-smtp";',
  },
  razorpay: {
    packageName: "@plinth/adapter-billing-razorpay",
    snippet: 'import { RazorpayBillingAdapter } from "@plinth/adapter-billing-razorpay";',
  },
  stripe: {
    packageName: "@plinth/adapter-billing-stripe",
    snippet: 'import { StripeBillingAdapter } from "@plinth/adapter-billing-stripe";',
  },
};

const MODULE_MAP: Record<string, { packageName: string; snippet: string }> = {
  brand: {
    packageName: "@plinth/modules-brand",
    snippet: 'import { BrandService } from "@plinth/modules-brand";',
  },
  tenants: {
    packageName: "@plinth/modules-tenants",
    snippet: 'import { TenantService } from "@plinth/modules-tenants";',
  },
  rbac: {
    packageName: "@plinth/modules-rbac",
    snippet: 'import { RbacService } from "@plinth/modules-rbac";',
  },
  "config-store": {
    packageName: "@plinth/modules-config-store",
    snippet: 'import { ConfigStore } from "@plinth/modules-config-store";',
  },
  audit: {
    packageName: "@plinth/modules-audit",
    snippet: 'import { AuditService } from "@plinth/modules-audit";',
  },
  auth: {
    packageName: "@plinth/modules-auth",
    snippet: 'import { AuthService } from "@plinth/modules-auth";',
  },
  users: {
    packageName: "@plinth/modules-users",
    snippet: 'import { UserService } from "@plinth/modules-users";',
  },
  compliance: {
    packageName: "@plinth/modules-compliance",
    snippet: 'import { ComplianceService } from "@plinth/modules-compliance";',
  },
  billing: {
    packageName: "@plinth/modules-billing",
    snippet: 'import { BillingService } from "@plinth/modules-billing";',
  },
  admin: {
    packageName: "@plinth/modules-admin",
    snippet: 'import { AdminService } from "@plinth/modules-admin";',
  },
};

export async function addCommand(rawOptions: AddOptions): Promise<AddResult> {
  const options = addOptionsSchema.parse(rawOptions);

  if (options.name.includes("/") || options.name.includes("\\")) {
    throw new Error(`Invalid name '${options.name}': contains path separators.`);
  }

  if (options.type === "adapter") {
    const entry = ADAPTER_MAP[options.name.toLowerCase()];
    if (!entry) {
      const available = Object.keys(ADAPTER_MAP).join(", ");
      throw new Error(`Unknown adapter '${options.name}'. Available: ${available}`);
    }

    return {
      success: true,
      packageName: entry.packageName,
      installCommand: `pnpm add ${entry.packageName}`,
      snippet: entry.snippet,
    };
  }

  const entry = MODULE_MAP[options.name.toLowerCase()];
  if (!entry) {
    const available = Object.keys(MODULE_MAP).join(", ");
    throw new Error(`Unknown module '${options.name}'. Available: ${available}`);
  }

  return {
    success: true,
    packageName: entry.packageName,
    installCommand: `pnpm add ${entry.packageName}`,
    snippet: entry.snippet,
  };
}
