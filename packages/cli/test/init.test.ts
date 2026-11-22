import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type * as readline from "node:readline/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type InitOptions, initCommand, promptInitOptions } from "../src/commands/init.js";

describe("CLI init command — plinth init (5-Category TDD Matrix)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plinth-init-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should scaffold default stack (sqlite + fastify + memory + db + local + stub + render-railway)", async () => {
      const targetDir = path.join(tmpDir, "my-default-service");

      const options: InitOptions = {
        name: "my-default-service",
        targetDir,
        tenancy: "single",
        database: "sqlite",
        http: "fastify",
        cache: "memory",
        queue: "db",
        storage: "local",
        email: "stub",
        billing: "stub",
        compliance: "none",
        deploy: "render-railway",
        force: false,
      };

      const result = await initCommand(options);
      expect(result.success).toBe(true);
      expect(result.targetDir).toBe(targetDir);

      // Verify essential files exist
      const pkgJsonPath = path.join(targetDir, "package.json");
      const tsconfigPath = path.join(targetDir, "tsconfig.json");
      const biomeJsonPath = path.join(targetDir, "biome.json");
      const envExamplePath = path.join(targetDir, ".env.example");
      const serverPath = path.join(targetDir, "src", "server.ts");
      const ciYmlPath = path.join(targetDir, ".github", "workflows", "ci.yml");
      const renderYamlPath = path.join(targetDir, "deploy", "render.yaml");

      const pkgRaw = await fs.readFile(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(pkgRaw);
      expect(pkg.name).toBe("my-default-service");
      expect(pkg.type).toBe("module");
      expect(pkg.dependencies).toHaveProperty("@plinth/core");
      expect(pkg.dependencies).toHaveProperty("@plinth/adapter-http-fastify");
      expect(pkg.dependencies).toHaveProperty("@plinth/adapter-db-sqlite");

      expect(await fs.stat(tsconfigPath)).toBeDefined();
      expect(await fs.stat(biomeJsonPath)).toBeDefined();
      expect(await fs.stat(envExamplePath)).toBeDefined();
      expect(await fs.stat(serverPath)).toBeDefined();
      expect(await fs.stat(ciYmlPath)).toBeDefined();
      expect(await fs.stat(renderYamlPath)).toBeDefined();

      const serverSource = await fs.readFile(serverPath, "utf-8");
      expect(serverSource).toContain("FastifyHttpAdapter");
      expect(serverSource).toContain("SqliteDatabaseAdapter");
      expect(serverSource).toContain("MemoryCacheAdapter");
    });

    it("should scaffold enterprise production stack (postgres + express + redis + bullmq + s3 + stripe + gdpr + aws)", async () => {
      const targetDir = path.join(tmpDir, "enterprise-backend");

      const options: InitOptions = {
        name: "enterprise-backend",
        targetDir,
        tenancy: "multi",
        database: "postgres",
        http: "express",
        cache: "redis",
        queue: "bullmq",
        storage: "s3",
        email: "smtp",
        billing: "stripe",
        compliance: "gdpr",
        deploy: "aws-terraform",
        force: false,
      };

      const result = await initCommand(options);
      expect(result.success).toBe(true);

      const pkgJson = JSON.parse(await fs.readFile(path.join(targetDir, "package.json"), "utf-8"));
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-db-postgres");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-http-express");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-cache-redis");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-queue-bullmq");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-storage-s3");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-email-smtp");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-billing-stripe");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/modules-compliance");

      const serverSource = await fs.readFile(path.join(targetDir, "src", "server.ts"), "utf-8");
      expect(serverSource).toContain("ExpressHttpAdapter");
      expect(serverSource).toContain("PostgresDatabaseAdapter");
      expect(serverSource).toContain("RedisCacheAdapter");
      expect(serverSource).toContain("BullMqQueueAdapter");

      // Verify AWS terraform deploy files
      const tfPath = path.join(targetDir, "deploy", "aws", "main.tf");
      expect(await fs.stat(tfPath)).toBeDefined();
    });

    it("should scaffold India DPDP + Razorpay stack with GCP deploy blueprint", async () => {
      const targetDir = path.join(tmpDir, "india-fintech");

      const options: InitOptions = {
        name: "india-fintech",
        targetDir,
        tenancy: "multi",
        database: "mysql",
        http: "fastify",
        cache: "redis",
        queue: "db",
        storage: "s3",
        email: "smtp",
        billing: "razorpay",
        compliance: "india-dpdp",
        deploy: "gcp-terraform",
        force: false,
      };

      const result = await initCommand(options);
      expect(result.success).toBe(true);

      const pkgJson = JSON.parse(await fs.readFile(path.join(targetDir, "package.json"), "utf-8"));
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-db-mysql");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/adapter-billing-razorpay");
      expect(pkgJson.dependencies).toHaveProperty("@plinth/modules-compliance");

      const tfPath = path.join(targetDir, "deploy", "gcp", "main.tf");
      expect(await fs.stat(tfPath)).toBeDefined();
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("should reject invalid project names (spaces, uppercase, symbols, empty)", async () => {
      const invalidNames = [
        "My Project",
        "UPPERCASE",
        "with_underscore",
        "test/slash",
        "",
        " ",
        "-dashstart",
      ];

      for (const invalidName of invalidNames) {
        await expect(
          initCommand({
            name: invalidName,
            targetDir: path.join(tmpDir, "sub"),
            tenancy: "single",
            database: "sqlite",
            http: "fastify",
            cache: "memory",
            queue: "db",
            storage: "local",
            email: "stub",
            billing: "none",
            compliance: "none",
            deploy: "none",
            force: false,
          }),
        ).rejects.toThrow();
      }
    });

    it("should reject invalid option values for enum selections", async () => {
      await expect(
        initCommand({
          name: "valid-name",
          targetDir: path.join(tmpDir, "sub"),
          tenancy: "invalid-tenancy" as unknown as "single",
          database: "sqlite",
          http: "fastify",
          cache: "memory",
          queue: "db",
          storage: "local",
          email: "stub",
          billing: "none",
          compliance: "none",
          deploy: "none",
          force: false,
        }),
      ).rejects.toThrow();
    });

    it("should refuse to scaffold into existing non-empty directory without force", async () => {
      const targetDir = path.join(tmpDir, "existing-dir");
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, "important.txt"), "preserve me");

      await expect(
        initCommand({
          name: "valid-name",
          targetDir,
          tenancy: "single",
          database: "sqlite",
          http: "fastify",
          cache: "memory",
          queue: "db",
          storage: "local",
          email: "stub",
          billing: "none",
          compliance: "none",
          deploy: "none",
          force: false,
        }),
      ).rejects.toThrow(/already exists and is not empty/);
    });

    it("should reject when targetDir is an existing file rather than directory", async () => {
      const filePath = path.join(tmpDir, "file-not-dir.txt");
      await fs.writeFile(filePath, "i am a file");

      await expect(
        initCommand({
          name: "valid-name",
          targetDir: filePath,
          tenancy: "single",
          database: "sqlite",
          http: "fastify",
          cache: "memory",
          queue: "db",
          storage: "local",
          email: "stub",
          billing: "none",
          compliance: "none",
          deploy: "none",
          force: false,
        }),
      ).rejects.toThrow(/exists and is not a directory/);
    });

    it("should succeed when scaffolding into existing non-empty directory with force=true", async () => {
      const targetDir = path.join(tmpDir, "existing-dir-force");
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, "old.txt"), "old content");

      const result = await initCommand({
        name: "forced-service",
        targetDir,
        tenancy: "single",
        database: "sqlite",
        http: "fastify",
        cache: "memory",
        queue: "db",
        storage: "local",
        email: "stub",
        billing: "none",
        compliance: "none",
        deploy: "none",
        force: true,
      });

      expect(result.success).toBe(true);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency & Idempotency", () => {
    it("should produce deterministic file contents across runs", async () => {
      const dirA = path.join(tmpDir, "run-a");
      const dirB = path.join(tmpDir, "run-b");

      const baseOpts: Omit<InitOptions, "targetDir" | "name"> = {
        tenancy: "single",
        database: "sqlite",
        http: "fastify",
        cache: "memory",
        queue: "db",
        storage: "local",
        email: "stub",
        billing: "stub",
        compliance: "none",
        deploy: "render-railway",
        force: false,
      };

      await initCommand({ ...baseOpts, name: "my-app", targetDir: dirA });
      await initCommand({ ...baseOpts, name: "my-app", targetDir: dirB });

      const contentA = await fs.readFile(path.join(dirA, "src", "server.ts"), "utf-8");
      const contentB = await fs.readFile(path.join(dirB, "src", "server.ts"), "utf-8");
      expect(contentA).toBe(contentB);
    });
  });

  // Category 4: Fault Injection
  describe("Category 4: Fault Injection", () => {
    it("should throw a clean error when target directory path cannot be created", async () => {
      // Test invalid path with null byte
      await expect(
        initCommand({
          name: "valid-name",
          targetDir: "\0invalid-null-path",
          tenancy: "single",
          database: "sqlite",
          http: "fastify",
          cache: "memory",
          queue: "db",
          storage: "local",
          email: "stub",
          billing: "none",
          compliance: "none",
          deploy: "none",
          force: false,
        }),
      ).rejects.toThrow();
    });
  });

  // Category 5: Security & Abuse
  describe("Category 5: Security & Abuse", () => {
    it("should prevent directory traversal escape in project name", async () => {
      const escapeAttempts = ["../../../etc/shadow", "..\\..\\evil", "test/../../escape"];

      for (const attempt of escapeAttempts) {
        await expect(
          initCommand({
            name: attempt,
            targetDir: path.join(tmpDir, "sub"),
            tenancy: "single",
            database: "sqlite",
            http: "fastify",
            cache: "memory",
            queue: "db",
            storage: "local",
            email: "stub",
            billing: "none",
            compliance: "none",
            deploy: "none",
            force: false,
          }),
        ).rejects.toThrow();
      }
    });

    it("should never generate live secrets or unredacted keys in .env.example", async () => {
      const targetDir = path.join(tmpDir, "sec-check");

      await initCommand({
        name: "sec-check",
        targetDir,
        tenancy: "multi",
        database: "postgres",
        http: "fastify",
        cache: "redis",
        queue: "bullmq",
        storage: "s3",
        email: "smtp",
        billing: "stripe",
        compliance: "both",
        deploy: "vps-caddy",
        force: false,
      });

      const envExample = await fs.readFile(path.join(targetDir, ".env.example"), "utf-8");
      expect(envExample).not.toMatch(/sk_live_[0-9a-zA-Z]+/);
      expect(envExample).not.toMatch(/rzp_live_[0-9a-zA-Z]+/);
      expect(envExample).toContain("MASTER_ENCRYPTION_KEY=");
      expect(envExample).toContain("PORT=3000");
    });

    it("should generate AI editor instructions (GEMINI.md, CLAUDE.md, AGENTS.md, .cursorrules)", async () => {
      const targetDir = path.join(tmpDir, "ai-check");

      await initCommand({
        name: "ai-check",
        targetDir,
        tenancy: "single",
        database: "sqlite",
        http: "fastify",
        cache: "memory",
        queue: "db",
        storage: "local",
        email: "stub",
        billing: "none",
        compliance: "none",
        deploy: "none",
        force: false,
      });

      expect(await fs.stat(path.join(targetDir, "GEMINI.md"))).toBeDefined();
      expect(await fs.stat(path.join(targetDir, "CLAUDE.md"))).toBeDefined();
      expect(await fs.stat(path.join(targetDir, "AGENTS.md"))).toBeDefined();
      expect(await fs.stat(path.join(targetDir, ".cursorrules"))).toBeDefined();
    });

    it("should reject project name with backslash", async () => {
      await expect(
        initCommand({
          name: "test\\evil",
          targetDir: path.join(tmpDir, "sub"),
          tenancy: "single",
          database: "sqlite",
          http: "fastify",
          cache: "memory",
          queue: "db",
          storage: "local",
          email: "stub",
          billing: "none",
          compliance: "none",
          deploy: "none",
          force: false,
        }),
      ).rejects.toThrow();
    });

    it("should scaffold with vps-caddy deployment and none billing", async () => {
      const targetDir = path.join(tmpDir, "vps-test");
      const result = await initCommand({
        name: "vps-test",
        targetDir,
        tenancy: "single",
        database: "sqlite",
        http: "fastify",
        cache: "memory",
        queue: "db",
        storage: "local",
        email: "stub",
        billing: "none",
        compliance: "both",
        deploy: "vps-caddy",
        force: false,
      });

      expect(result.success).toBe(true);
      expect(await fs.stat(path.join(targetDir, "deploy", "Caddyfile"))).toBeDefined();
    });

    it("should handle promptInitOptions with mock question resolver", async () => {
      const mockAnswers: Record<string, string> = {
        "Project name": "mock-app",
        "Tenancy mode": "single",
        Database: "sqlite",
        "HTTP framework": "fastify",
        "Cache adapter": "memory",
        "Queue adapter": "db",
        "Storage adapter": "local",
        "Email adapter": "stub",
        "Billing provider": "stub",
        "Compliance pack": "none",
        "Deployment target": "render-railway",
      };

      const mockRl = {
        question: vi.fn().mockImplementation(async (prompt: string) => {
          for (const [key, val] of Object.entries(mockAnswers)) {
            if (prompt.includes(key)) {
              return val;
            }
          }
          return "";
        }),
        close: vi.fn(),
      } as unknown as readline.Interface;

      const options = await promptInitOptions({}, mockRl);
      expect(options.name).toBe("mock-app");
      expect(options.database).toBe("sqlite");
      expect(options.http).toBe("fastify");
    });
  });
});
