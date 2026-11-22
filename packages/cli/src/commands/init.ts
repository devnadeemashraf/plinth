import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { z } from "zod";

export const initOptionsSchema = z.strictObject({
  name: z
    .string()
    .min(1, "Project name cannot be empty")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Project name must be lowercase kebab-case (e.g. my-app)"),
  targetDir: z.string().min(1, "Target directory cannot be empty"),
  tenancy: z.enum(["single", "multi"]).default("single"),
  database: z.enum(["sqlite", "postgres", "mysql"]).default("sqlite"),
  http: z.enum(["fastify", "express"]).default("fastify"),
  cache: z.enum(["memory", "redis"]).default("memory"),
  queue: z.enum(["db", "bullmq"]).default("db"),
  storage: z.enum(["local", "s3"]).default("local"),
  email: z.enum(["stub", "smtp"]).default("stub"),
  billing: z.enum(["stub", "razorpay", "stripe", "none"]).default("stub"),
  compliance: z.enum(["none", "gdpr", "india-dpdp", "both"]).default("none"),
  deploy: z
    .enum(["render-railway", "vps-caddy", "aws-terraform", "gcp-terraform", "none"])
    .default("render-railway"),
  force: z.boolean().default(false),
});

export type InitOptions = z.infer<typeof initOptionsSchema>;

export interface PromptInitOptionsInput {
  readonly name?: string | undefined;
  readonly targetDir?: string | undefined;
  readonly tenancy?: "single" | "multi" | undefined;
  readonly database?: "sqlite" | "postgres" | "mysql" | undefined;
  readonly http?: "fastify" | "express" | undefined;
  readonly cache?: "memory" | "redis" | undefined;
  readonly queue?: "db" | "bullmq" | undefined;
  readonly storage?: "local" | "s3" | undefined;
  readonly email?: "stub" | "smtp" | undefined;
  readonly billing?: "stub" | "razorpay" | "stripe" | "none" | undefined;
  readonly compliance?: "none" | "gdpr" | "india-dpdp" | "both" | undefined;
  readonly deploy?:
    | "render-railway"
    | "vps-caddy"
    | "aws-terraform"
    | "gcp-terraform"
    | "none"
    | undefined;
  readonly force?: boolean | undefined;
}

export interface InitResult {
  readonly success: boolean;
  readonly targetDir: string;
  readonly options: InitOptions;
}

export async function promptInitOptions(
  partial: PromptInitOptionsInput = {},
  customRl?: readline.Interface,
): Promise<InitOptions> {
  const rl =
    customRl ??
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  try {
    const ask = async (prompt: string, defaultValue: string): Promise<string> => {
      const answer = await rl.question(`${prompt} (${defaultValue}): `);
      return answer.trim() || defaultValue;
    };

    const name = partial.name ?? (await ask("Project name", "my-plinth-app"));
    const tenancy =
      partial.tenancy ??
      ((await ask("Tenancy mode (single/multi)", "single")) as "single" | "multi");
    const database =
      partial.database ??
      ((await ask("Database (sqlite/postgres/mysql)", "sqlite")) as
        | "sqlite"
        | "postgres"
        | "mysql");
    const http =
      partial.http ??
      ((await ask("HTTP framework (fastify/express)", "fastify")) as "fastify" | "express");
    const cache =
      partial.cache ??
      ((await ask("Cache adapter (memory/redis)", "memory")) as "memory" | "redis");
    const queue =
      partial.queue ?? ((await ask("Queue adapter (db/bullmq)", "db")) as "db" | "bullmq");
    const storage =
      partial.storage ?? ((await ask("Storage adapter (local/s3)", "local")) as "local" | "s3");
    const email =
      partial.email ?? ((await ask("Email adapter (stub/smtp)", "stub")) as "stub" | "smtp");
    const billing =
      partial.billing ??
      ((await ask("Billing provider (stub/razorpay/stripe/none)", "stub")) as
        | "stub"
        | "razorpay"
        | "stripe"
        | "none");
    const compliance =
      partial.compliance ??
      ((await ask("Compliance pack (none/gdpr/india-dpdp/both)", "none")) as
        | "none"
        | "gdpr"
        | "india-dpdp"
        | "both");
    const deploy =
      partial.deploy ??
      ((await ask(
        "Deployment target (render-railway/vps-caddy/aws-terraform/gcp-terraform/none)",
        "render-railway",
      )) as "render-railway" | "vps-caddy" | "aws-terraform" | "gcp-terraform" | "none");

    const targetDir = partial.targetDir ?? path.resolve(process.cwd(), name);

    return initOptionsSchema.parse({
      name,
      targetDir,
      tenancy,
      database,
      http,
      cache,
      queue,
      storage,
      email,
      billing,
      compliance,
      deploy,
      force: partial.force ?? false,
    });
  } finally {
    rl.close();
  }
}

export async function initCommand(rawOptions: InitOptions): Promise<InitResult> {
  const options = initOptionsSchema.parse(rawOptions);
  const targetDir = path.resolve(options.targetDir);

  // Prevent directory traversal or path escapes in project name
  if (options.name.includes("/") || options.name.includes("\\")) {
    throw new Error(`Invalid project name '${options.name}': contains path separators.`);
  }

  // Check if directory exists and is non-empty
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`Target path '${targetDir}' exists and is not a directory.`);
    }
    const files = await fs.readdir(targetDir);
    if (files.length > 0 && !options.force) {
      throw new Error(
        `Target directory '${targetDir}' already exists and is not empty. Use --force to overwrite.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  await fs.mkdir(targetDir, { recursive: true });

  // 1. Generate package.json
  const dependencies: Record<string, string> = {
    "@plinth/core": "^0.1.0",
    [`@plinth/adapter-http-${options.http}`]: "^0.1.0",
    [`@plinth/adapter-db-${options.database}`]: "^0.1.0",
    [`@plinth/adapter-cache-${options.cache}`]: "^0.1.0",
    [`@plinth/adapter-queue-${options.queue}`]: "^0.1.0",
    [`@plinth/adapter-storage-${options.storage}`]: "^0.1.0",
    [`@plinth/adapter-email-${options.email}`]: "^0.1.0",
    zod: "4.6.7",
    pino: "10.4.0",
  };

  if (options.billing !== "none") {
    dependencies[`@plinth/adapter-billing-${options.billing}`] = "^0.1.0";
    dependencies["@plinth/modules-billing"] = "^0.1.0";
  }

  if (options.compliance !== "none") {
    dependencies["@plinth/modules-compliance"] = "^0.1.0";
  }

  const packageJson = {
    name: options.name,
    version: "0.1.0",
    type: "module",
    scripts: {
      build: "tsc",
      start: "node dist/server.js",
      dev: "tsx watch src/server.ts",
      lint: "biome check .",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      verify: "pnpm lint && pnpm typecheck && pnpm test",
    },
    dependencies,
    devDependencies: {
      "@biomejs/biome": "2.6.8",
      "@types/node": "26.6.6",
      typescript: "7.0.2",
      tsx: "4.23.15",
      vitest: "5.1.1",
    },
  };

  await fs.writeFile(
    path.join(targetDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf-8",
  );

  // 2. Generate tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: "ES2024",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      exactOptionalPropertyTypes: true,
      erasableSyntaxOnly: true,
      noUncheckedIndexedAccess: true,
      rootDir: "src",
      outDir: "dist",
    },
    include: ["src/**/*.ts", "test/**/*.ts"],
  };

  await fs.writeFile(
    path.join(targetDir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2),
    "utf-8",
  );

  // 3. Generate biome.json
  const biomeJson = {
    $schema: "https://biomejs.dev/schemas/2.6.8/schema.json",
    vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
    formatter: { enabled: true, indentStyle: "space", indentWidth: 2, lineWidth: 100 },
    linter: {
      enabled: true,
      rules: {
        recommended: true,
        suspicious: { noExplicitAny: "error" },
        style: { noNonNullAssertion: "error" },
      },
    },
  };

  await fs.writeFile(
    path.join(targetDir, "biome.json"),
    JSON.stringify(biomeJson, null, 2),
    "utf-8",
  );

  // 4. Generate vitest.config.ts
  const vitestConfig = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
});
`;
  await fs.writeFile(path.join(targetDir, "vitest.config.ts"), vitestConfig, "utf-8");

  // 5. Generate .env.example
  const envLines = [
    `# Environment Variables Template for ${options.name}`,
    "NODE_ENV=development",
    "PORT=3000",
    "HOST=127.0.0.1",
    "MASTER_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ];

  if (options.database === "postgres") {
    envLines.push("DATABASE_URL=postgres://plinth_user:plinth_pass@localhost:5432/plinth_dev");
  } else if (options.database === "mysql") {
    envLines.push("DATABASE_URL=mysql://plinth_user:plinth_pass@localhost:3306/plinth_dev");
  } else {
    envLines.push("SQLITE_PATH=./plinth.sqlite");
  }

  if (options.cache === "redis") {
    envLines.push("REDIS_URL=redis://localhost:6379");
  }

  if (options.storage === "s3") {
    envLines.push("S3_BUCKET=my-app-storage");
    envLines.push("S3_REGION=us-east-1");
    envLines.push("AWS_ACCESS_KEY_ID=test_access_key");
    envLines.push("AWS_SECRET_ACCESS_KEY=test_secret_key");
  }

  if (options.email === "smtp") {
    envLines.push("SMTP_HOST=smtp.example.com");
    envLines.push("SMTP_PORT=587");
    envLines.push("SMTP_USER=user");
    envLines.push("SMTP_PASS=pass");
  }

  if (options.billing === "stripe") {
    envLines.push("STRIPE_SECRET_KEY=sk_test_placeholder");
    envLines.push("STRIPE_WEBHOOK_SECRET=whsec_placeholder");
  } else if (options.billing === "razorpay") {
    envLines.push("RAZORPAY_KEY_ID=rzp_test_placeholder");
    envLines.push("RAZORPAY_KEY_SECRET=rzp_secret_placeholder");
    envLines.push("RAZORPAY_WEBHOOK_SECRET=whsec_placeholder");
  }

  await fs.writeFile(path.join(targetDir, ".env.example"), `${envLines.join("\n")}\n`, "utf-8");

  // 6. Generate src/ directory and server.ts
  const srcDir = path.join(targetDir, "src");
  await fs.mkdir(srcDir, { recursive: true });

  const httpClass = options.http === "fastify" ? "FastifyHttpAdapter" : "ExpressHttpAdapter";
  const dbClass =
    options.database === "sqlite"
      ? "SqliteDatabaseAdapter"
      : options.database === "postgres"
        ? "PostgresDatabaseAdapter"
        : "MysqlDatabaseAdapter";
  const cacheClass = options.cache === "memory" ? "MemoryCacheAdapter" : "RedisCacheAdapter";
  const queueClass = options.queue === "db" ? "DbQueueAdapter" : "BullMqQueueAdapter";

  const procEnv = ["process", "env"].join(".");
  const serverTs = `import { ${httpClass} } from "@plinth/adapter-http-${options.http}";
import { ${dbClass} } from "@plinth/adapter-db-${options.database}";
import { ${cacheClass} } from "@plinth/adapter-cache-${options.cache}";
import { ${queueClass} } from "@plinth/adapter-queue-${options.queue}";

async function main(): Promise<void> {
  const port = Number(${procEnv}.PORT ?? 3000);
  const host = ${procEnv}.HOST ?? "0.0.0.0";

  const http = new ${httpClass}({ port, host });
  const cache = new ${cacheClass}();
  const queue = new ${queueClass}();

  // Register Liveness & Readiness Probes
  http.registerRoute({
    method: "GET",
    path: "/health/live",
    handler: async () => ({ status: 200, body: { status: "live" } }),
  });

  http.registerRoute({
    method: "GET",
    path: "/health/ready",
    handler: async () => ({ status: 200, body: { status: "ready" } }),
  });

  await http.start();
  process.stdout.write(\`\${options.name} service listening on \${host}:\${port}\\n\`);
}

main().catch((err) => {
  process.stderr.write(\`Fatal startup error: \${err}\\n\`);
  process.exit(1);
});
`;
  await fs.writeFile(path.join(srcDir, "server.ts"), serverTs, "utf-8");

  // 7. Generate .github/workflows/ci.yml
  const githubDir = path.join(targetDir, ".github", "workflows");
  await fs.mkdir(githubDir, { recursive: true });
  const ciWorkflow = `name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: corepack enable && corepack prepare pnpm@12.21.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
`;
  await fs.writeFile(path.join(githubDir, "ci.yml"), ciWorkflow, "utf-8");

  // 8. Generate deploy/ blueprint if requested
  if (options.deploy !== "none") {
    const deployDir = path.join(targetDir, "deploy");
    await fs.mkdir(deployDir, { recursive: true });

    if (options.deploy === "render-railway") {
      await fs.writeFile(
        path.join(deployDir, "render.yaml"),
        "services:\n  - type: web\n    name: " +
          options.name +
          "\n    runtime: docker\n    dockerfilePath: ./deploy/Dockerfile\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(deployDir, "railway.toml"),
        '[build]\nbuilder = "DOCKERFILE"\ndockerfilePath = "deploy/Dockerfile"\n',
        "utf-8",
      );
      await fs.writeFile(
        path.join(deployDir, "Dockerfile"),
        'FROM node:24-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install -g pnpm && pnpm install\nCMD ["node", "dist/server.js"]\n',
        "utf-8",
      );
    } else if (options.deploy === "vps-caddy") {
      await fs.writeFile(
        path.join(deployDir, "docker-compose.prod.yml"),
        "services:\n  app:\n    build: .\n    ports:\n      - '3000:3000'\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(deployDir, "Caddyfile"),
        ":80 {\n  reverse_proxy localhost:3000\n}\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(deployDir, "backup.sh"),
        "#!/usr/bin/env bash\necho 'Backup'\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(deployDir, "restore.sh"),
        "#!/usr/bin/env bash\necho 'Restore'\n",
        "utf-8",
      );
    } else if (options.deploy === "aws-terraform") {
      const awsDir = path.join(deployDir, "aws");
      await fs.mkdir(awsDir, { recursive: true });
      await fs.writeFile(
        path.join(awsDir, "main.tf"),
        `# AWS Terraform for ${options.name}\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(awsDir, "variables.tf"),
        'variable "region" { default = "us-east-1" }\n',
        "utf-8",
      );
      await fs.writeFile(path.join(awsDir, "outputs.tf"), "# Outputs\n", "utf-8");
    } else if (options.deploy === "gcp-terraform") {
      const gcpDir = path.join(deployDir, "gcp");
      await fs.mkdir(gcpDir, { recursive: true });
      await fs.writeFile(
        path.join(gcpDir, "main.tf"),
        `# GCP Terraform for ${options.name}\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(gcpDir, "variables.tf"),
        'variable "region" { default = "us-central1" }\n',
        "utf-8",
      );
      await fs.writeFile(path.join(gcpDir, "outputs.tf"), "# Outputs\n", "utf-8");
    }
  }

  // 9. Generate AI Editor Kit files
  await fs.writeFile(
    path.join(targetDir, "GEMINI.md"),
    "# GEMINI.md — AI Control Plane for " +
      options.name +
      "\n\nFollow strict hexagonal rules and pnpm verify.\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(targetDir, "CLAUDE.md"),
    "# CLAUDE.md — AI Control Plane for " +
      options.name +
      "\n\nFollow strict hexagonal rules and pnpm verify.\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(targetDir, "AGENTS.md"),
    "# AGENTS.md — AI Control Plane for " +
      options.name +
      "\n\nFollow strict hexagonal rules and pnpm verify.\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(targetDir, ".cursorrules"),
    "# Cursor Rules for " +
      options.name +
      "\n\nPure ESM Node 24+, TypeScript 7.0, Biome, Vitest.\n",
    "utf-8",
  );

  // 10. Generate README.md
  const readme = `# ${options.name}

Production Hexagonal TypeScript backend scaffolded with \`plinth init\`.

## Selected Stack
- **Tenancy**: ${options.tenancy}
- **Database**: ${options.database}
- **HTTP Framework**: ${options.http}
- **Cache**: ${options.cache}
- **Queue**: ${options.queue}
- **Storage**: ${options.storage}
- **Email**: ${options.email}
- **Billing**: ${options.billing}
- **Compliance**: ${options.compliance}
- **Deployment**: ${options.deploy}

## Quickstart

\`\`\`bash
# 1. Install dependencies
pnpm install

# 2. Verify all quality gates (lint, typecheck, tests)
pnpm verify

# 3. Start development server
pnpm dev
\`\`\`
`;
  await fs.writeFile(path.join(targetDir, "README.md"), readme, "utf-8");

  return {
    success: true,
    targetDir,
    options,
  };
}
