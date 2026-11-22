import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DeployAddOptions, deployAddCommand } from "../src/commands/deploy-add.js";

describe("CLI deploy:add command — plinth deploy:add (5-Category TDD Matrix)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plinth-deploy-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("Category 1: Happy Path", () => {
    it("should scaffold render-railway blueprint files", async () => {
      const options: DeployAddOptions = {
        target: "render-railway",
        projectDir: tmpDir,
      };

      const result = await deployAddCommand(options);
      expect(result.success).toBe(true);

      const renderYaml = path.join(tmpDir, "deploy", "render.yaml");
      const railwayToml = path.join(tmpDir, "deploy", "railway.toml");
      const dockerfile = path.join(tmpDir, "deploy", "Dockerfile");

      expect(await fs.stat(renderYaml)).toBeDefined();
      expect(await fs.stat(railwayToml)).toBeDefined();
      expect(await fs.stat(dockerfile)).toBeDefined();
    });

    it("should scaffold vps-caddy blueprint files", async () => {
      const options: DeployAddOptions = {
        target: "vps-caddy",
        projectDir: tmpDir,
      };

      const result = await deployAddCommand(options);
      expect(result.success).toBe(true);

      const composeFile = path.join(tmpDir, "deploy", "docker-compose.prod.yml");
      const caddyfile = path.join(tmpDir, "deploy", "Caddyfile");
      const backupScript = path.join(tmpDir, "deploy", "backup.sh");
      const restoreScript = path.join(tmpDir, "deploy", "restore.sh");

      expect(await fs.stat(composeFile)).toBeDefined();
      expect(await fs.stat(caddyfile)).toBeDefined();
      expect(await fs.stat(backupScript)).toBeDefined();
      expect(await fs.stat(restoreScript)).toBeDefined();
    });

    it("should scaffold aws-terraform blueprint files", async () => {
      const options: DeployAddOptions = {
        target: "aws-terraform",
        projectDir: tmpDir,
      };

      const result = await deployAddCommand(options);
      expect(result.success).toBe(true);

      const mainTf = path.join(tmpDir, "deploy", "aws", "main.tf");
      const varsTf = path.join(tmpDir, "deploy", "aws", "variables.tf");
      const outTf = path.join(tmpDir, "deploy", "aws", "outputs.tf");

      expect(await fs.stat(mainTf)).toBeDefined();
      expect(await fs.stat(varsTf)).toBeDefined();
      expect(await fs.stat(outTf)).toBeDefined();
    });

    it("should scaffold gcp-terraform blueprint files", async () => {
      const options: DeployAddOptions = {
        target: "gcp-terraform",
        projectDir: tmpDir,
      };

      const result = await deployAddCommand(options);
      expect(result.success).toBe(true);

      const mainTf = path.join(tmpDir, "deploy", "gcp", "main.tf");
      const varsTf = path.join(tmpDir, "deploy", "gcp", "variables.tf");
      const outTf = path.join(tmpDir, "deploy", "gcp", "outputs.tf");

      expect(await fs.stat(mainTf)).toBeDefined();
      expect(await fs.stat(varsTf)).toBeDefined();
      expect(await fs.stat(outTf)).toBeDefined();
    });
  });

  describe("Category 2: Boundary & Fuzzing", () => {
    it("should reject unknown deploy target", async () => {
      await expect(
        deployAddCommand({
          target: "unknown-cloud" as unknown as "render-railway",
          projectDir: tmpDir,
        }),
      ).rejects.toThrow(/Unknown deploy target/);
    });
  });

  describe("Category 3: Concurrency & Idempotency", () => {
    it("should safely overwrite files on repeated calls", async () => {
      await deployAddCommand({ target: "render-railway", projectDir: tmpDir });
      const res = await deployAddCommand({ target: "render-railway", projectDir: tmpDir });
      expect(res.success).toBe(true);
    });
  });

  describe("Category 4: Fault Injection", () => {
    it("should throw when project directory is invalid", async () => {
      await expect(
        deployAddCommand({
          target: "render-railway",
          projectDir: "\0invalid-path",
        }),
      ).rejects.toThrow();
    });
  });

  describe("Category 5: Security & Abuse", () => {
    it("should prevent directory traversal in target option", async () => {
      await expect(
        deployAddCommand({
          target: "../../etc" as unknown as "render-railway",
          projectDir: tmpDir,
        }),
      ).rejects.toThrow();
    });
  });
});
