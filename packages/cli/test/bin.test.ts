import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/bin.js";

describe("CLI Runner - plinth (5-Category TDD)", () => {
  it("should print help information when invoked with --help or no args", async () => {
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["--help"]);
      const output = stdoutChunks.join("");
      expect(output).toContain("Plinth CLI");
      expect(output).toContain("admin:create-superuser");
      expect(output).toContain("init");
      expect(output).toContain("add <type> <name>");
      expect(output).toContain("deploy:add <target>");
    } finally {
      spy.mockRestore();
    }
  });

  it("should print version when invoked with --version or -v", async () => {
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["--version"]);
      await runCli(["-v"]);
      const output = stdoutChunks.join("");
      expect(output).toContain("plinth 0.1.0");
    } finally {
      spy.mockRestore();
    }
  });

  it("should show error when required flags are missing", async () => {
    const stderrChunks: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((str) => {
      stderrChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["admin:create-superuser"]);
      const output = stderrChunks.join("");
      expect(output).toContain("--email and --password are required");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      spy.mockRestore();
    }
  });

  it("should handle unknown commands cleanly", async () => {
    const stderrChunks: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((str) => {
      stderrChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["unknown-command"]);
      const output = stderrChunks.join("");
      expect(output).toContain("Unknown command: 'unknown-command'");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      spy.mockRestore();
    }
  });

  it("should handle valid admin:create-superuser invocation with flags", async () => {
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    try {
      await runCli([
        "admin:create-superuser",
        "--email",
        "super@example.com",
        "--password",
        "ValidPass123#",
        "--username",
        "superadmin",
        "--tenant-id",
        "tenant_custom",
      ]);
      const output = stdoutChunks.join("");
      expect(output).toContain("Creating super user 'super@example.com (superadmin)'");
      expect(output).toContain("tenant_custom");
    } finally {
      spy.mockRestore();
    }
  });

  it("should handle add command via CLI", async () => {
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["add", "adapter", "redis"]);
      const output = stdoutChunks.join("");
      expect(output).toContain("Added adapter 'redis'");
      expect(output).toContain("@plinth/adapter-cache-redis");
    } finally {
      spy.mockRestore();
    }
  });

  it("should handle add command missing arguments cleanly", async () => {
    const stderrChunks: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((str) => {
      stderrChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["add"]);
      const output = stderrChunks.join("");
      expect(output).toContain("Usage: plinth add <adapter|module> <name>");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      spy.mockRestore();
    }
  });

  it("should handle deploy:add command via CLI", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "plinth-cli-deploy-"));
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      await runCli(["deploy:add", "render-railway"]);
      const output = stdoutChunks.join("");
      expect(output).toContain("Successfully added deploy blueprint 'render-railway'");
    } finally {
      process.chdir(origCwd);
      spy.mockRestore();
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => null);
    }
  });

  it("should handle deploy:add command missing argument cleanly", async () => {
    const stderrChunks: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((str) => {
      stderrChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["deploy:add"]);
      const output = stderrChunks.join("");
      expect(output).toContain("Usage: plinth deploy:add");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      spy.mockRestore();
    }
  });

  it("should handle init command with flags non-interactively", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "plinth-cli-init-"));
    const targetDir = path.join(tmp, "cli-scaffolded");
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    try {
      await runCli([
        "init",
        "--name",
        "cli-scaffolded",
        "--target-dir",
        targetDir,
        "--database",
        "sqlite",
        "--http",
        "fastify",
        "--yes",
      ]);
      const output = stdoutChunks.join("");
      expect(output).toContain("Successfully initialized Plinth service");
      expect(await fs.stat(path.join(targetDir, "package.json"))).toBeDefined();
    } finally {
      spy.mockRestore();
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => null);
    }
  });

  it("should handle init command error cleanly", async () => {
    const stderrChunks: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((str) => {
      stderrChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["init", "--name", "INVALID NAME WITH SPACES"]);
      const output = stderrChunks.join("");
      expect(output).toContain("Init Error:");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      spy.mockRestore();
    }
  });

  it("should handle -h flag and empty args cleanly", async () => {
    const stdoutChunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
      stdoutChunks.push(String(str));
      return true;
    });

    try {
      await runCli(["-h"]);
      await runCli([]);
      const output = stdoutChunks.join("");
      expect(output).toContain("Plinth CLI");
    } finally {
      spy.mockRestore();
    }
  });
});
