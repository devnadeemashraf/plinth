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
