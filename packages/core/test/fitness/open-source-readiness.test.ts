import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
// Root is 4 directories up: packages/core/test/fitness -> plinth-ts
const repoRoot = resolve(currentDir, "../../../../");

function findWorkspacePackages(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      const pkgPath = join(fullPath, "package.json");
      if (existsSync(pkgPath)) {
        results.push(fullPath);
      }
      // Recurse for nested structures like packages/adapters/*/*
      results.push(...findWorkspacePackages(fullPath));
    }
  }

  return [...new Set(results)];
}

function readTextFile(path: string): string {
  return readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
}

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  description?: string;
  license?: string;
  author?: string;
  homepage?: string;
  bugs?: { url: string };
  repository?: { type: string; url: string; directory?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readJsonFile(path: string): PackageJson {
  return JSON.parse(readTextFile(path));
}

describe("Open Source Readiness & Community Health Verification (5-Category TDD Matrix)", () => {
  // Category 1: Happy Path — Standard Community Health Files Exist
  describe("Category 1: Happy Path — Community Health Files", () => {
    it("should possess all mandatory root community documents", () => {
      const requiredRootFiles = [
        "LICENSE",
        "SECURITY.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        "CHANGELOG.md",
        "README.md",
      ];

      for (const file of requiredRootFiles) {
        const filePath = join(repoRoot, file);
        expect(existsSync(filePath), `Missing root community file: ${file}`).toBe(true);
      }
    });

    it("should possess all mandatory GitHub community templates and configurations", () => {
      const requiredGithubFiles = [
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/labels.yml",
        ".github/ISSUE_TEMPLATE/config.yml",
        ".github/ISSUE_TEMPLATE/bug_report.yml",
        ".github/ISSUE_TEMPLATE/feature_request.yml",
        ".github/ISSUE_TEMPLATE/adapter_proposal.yml",
      ];

      for (const file of requiredGithubFiles) {
        const filePath = join(repoRoot, file);
        expect(existsSync(filePath), `Missing GitHub file: ${file}`).toBe(true);
      }
    });
  });

  // Category 2: Boundary & Formatting Validation
  describe("Category 2: Boundary & Document Content Validation", () => {
    it("should have a valid MIT License with 2026 Plinth Authors copyright", () => {
      const licensePath = join(repoRoot, "LICENSE");
      expect(existsSync(licensePath)).toBe(true);
      const content = readTextFile(licensePath);
      expect(content).toContain("MIT License");
      expect(content).toContain("Copyright (c) 2026 Plinth Authors");
    });

    it("should have a comprehensive SECURITY.md with supported versions, response SLA, and reporting instructions", () => {
      const securityPath = join(repoRoot, "SECURITY.md");
      expect(existsSync(securityPath)).toBe(true);
      const content = readTextFile(securityPath);
      expect(content).toContain("Supported Versions");
      expect(content).toContain("1.0.x");
      expect(content).toContain("Reporting a Vulnerability");
      expect(content).toContain("security@plinth.dev");
      expect(content).toContain("Response Timeline");
    });

    it("should have an actionable CONTRIBUTING.md detailing TDD, path aliases, and PR workflows", () => {
      const contribPath = join(repoRoot, "CONTRIBUTING.md");
      expect(existsSync(contribPath)).toBe(true);
      const content = readTextFile(contribPath);
      expect(content).toContain("5-Category Test Matrix");
      expect(content).toContain("Path Aliases");
      expect(content).toContain("pnpm verify");
      expect(content).toContain("Code of Conduct");
    });

    it("should have CODE_OF_CONDUCT.md defining clear standards and expectations", () => {
      const cocPath = join(repoRoot, "CODE_OF_CONDUCT.md");
      expect(existsSync(cocPath)).toBe(true);
      const content = readTextFile(cocPath);
      expect(content).toContain("Code of Conduct");
      expect(content).toContain("Our Standards");
    });

    it("should have CHANGELOG.md following Keep a Changelog with version 1.0.0", () => {
      const changelogPath = join(repoRoot, "CHANGELOG.md");
      expect(existsSync(changelogPath)).toBe(true);
      const content = readTextFile(changelogPath);
      expect(content).toContain("Keep a Changelog");
      expect(content).toContain("[1.0.0]");
    });

    it("should configure .github/ISSUE_TEMPLATE/config.yml with blank issues disabled", () => {
      const configPath = join(repoRoot, ".github/ISSUE_TEMPLATE/config.yml");
      expect(existsSync(configPath)).toBe(true);
      const content = readTextFile(configPath);
      expect(content).toMatch(/blank_issues_enabled:\s*false/);
      expect(content).toContain("contact_links:");
    });

    it("should define well-structured issue labels in .github/labels.yml", () => {
      const labelsPath = join(repoRoot, ".github/labels.yml");
      expect(existsSync(labelsPath)).toBe(true);
      const content = readTextFile(labelsPath);
      expect(content).toContain("name:");
      expect(content).toContain("color:");
      expect(content).toContain("description:");
      expect(content).toContain("type: bug");
      expect(content).toContain("type: feature");
      expect(content).toContain("area: core");
    });
  });

  // Category 3: Monorepo Package Metadata Compliance
  describe("Category 3: Monorepo Package Metadata Compliance", () => {
    it("should ensure every workspace package in packages/ contains complete npm publishing metadata", () => {
      const packagesDir = join(repoRoot, "packages");
      const packageDirs = findWorkspacePackages(packagesDir);
      expect(packageDirs.length).toBeGreaterThanOrEqual(30);

      for (const dir of packageDirs) {
        const pkgPath = join(dir, "package.json");
        const relDir = relative(repoRoot, dir).replace(/\\/g, "/");
        const pkg = readJsonFile(pkgPath);

        expect(pkg.name, `Package at ${relDir} must have a name starting with @plinth/`).toMatch(
          /^@plinth\//,
        );
        expect(pkg.license, `Package ${pkg.name} must declare MIT license`).toBe("MIT");
        expect(pkg.author, `Package ${pkg.name} must declare author as Plinth Contributors`).toBe(
          "Plinth Contributors",
        );
        expect(pkg.homepage, `Package ${pkg.name} must declare valid homepage`).toBe(
          "https://plinth-ts.github.io/plinth",
        );
        expect(pkg.bugs?.url, `Package ${pkg.name} must declare valid issues url`).toBe(
          "https://github.com/plinth-ts/plinth/issues",
        );
        expect(pkg.repository?.url, `Package ${pkg.name} must declare repository url`).toBe(
          "https://github.com/plinth-ts/plinth.git",
        );
        expect(
          pkg.repository?.directory,
          `Package ${pkg.name} must declare exact directory in repository`,
        ).toBe(relDir);
        expect(
          typeof pkg.description === "string" && pkg.description.trim().length > 10,
          `Package ${pkg.name} must have a descriptive summary`,
        ).toBe(true);
      }
    });
  });

  // Category 4: Adversarial & Anti-Leak Scanning
  describe("Category 4: Adversarial & Anti-Leak Invariants", () => {
    it("should never leak local filesystem paths (e.g. C:/Users) into public community files", () => {
      const publicFiles = [
        "LICENSE",
        "SECURITY.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        "CHANGELOG.md",
        "README.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/labels.yml",
        ".github/ISSUE_TEMPLATE/config.yml",
        ".github/ISSUE_TEMPLATE/bug_report.yml",
        ".github/ISSUE_TEMPLATE/feature_request.yml",
        ".github/ISSUE_TEMPLATE/adapter_proposal.yml",
      ];

      for (const file of publicFiles) {
        const filePath = join(repoRoot, file);
        if (existsSync(filePath)) {
          const content = readTextFile(filePath);
          expect(content).not.toMatch(/[A-Za-z]:[\\/]Users[\\/]/i);
        }
      }
    });

    it("should never contain prohibited third-party corporate trademarks in public community files", () => {
      const publicFiles = [
        "LICENSE",
        "SECURITY.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        "CHANGELOG.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/labels.yml",
        ".github/ISSUE_TEMPLATE/config.yml",
        ".github/ISSUE_TEMPLATE/bug_report.yml",
        ".github/ISSUE_TEMPLATE/feature_request.yml",
        ".github/ISSUE_TEMPLATE/adapter_proposal.yml",
      ];

      for (const file of publicFiles) {
        const filePath = join(repoRoot, file);
        if (existsSync(filePath)) {
          const content = readTextFile(filePath);
          // Ensure zero company references
          expect(content).not.toMatch(/\b(Microsoft|Google|Meta|Apple|Amazon|Uber|Netflix)\b/i);
        }
      }
    });
  });

  // Category 5: Cross-Package Consistency & Release Integrity
  describe("Category 5: Cross-Package Consistency & Release Integrity", () => {
    it("should ensure every workspace package is locked to version 1.0.0", () => {
      const packagesDir = join(repoRoot, "packages");
      const packageDirs = findWorkspacePackages(packagesDir);

      for (const dir of packageDirs) {
        const pkg = readJsonFile(join(dir, "package.json"));
        expect(pkg.version, `Package ${pkg.name} version must be 1.0.0`).toBe("1.0.0");
      }
    });

    it("should ensure root package.json is private with version 1.0.0", () => {
      const rootPkg = readJsonFile(join(repoRoot, "package.json"));
      expect(rootPkg.private).toBe(true);
      expect(rootPkg.version).toBe("1.0.0");
    });

    it("should ensure all internal @plinth/* dependencies use workspace:* protocol", () => {
      const packagesDir = join(repoRoot, "packages");
      const packageDirs = findWorkspacePackages(packagesDir);

      for (const dir of packageDirs) {
        const pkg = readJsonFile(join(dir, "package.json"));
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };

        for (const [depName, depVersion] of Object.entries(allDeps)) {
          if (depName.startsWith("@plinth/")) {
            expect(
              depVersion,
              `Internal dependency ${depName} in ${pkg.name} must use workspace:*`,
            ).toBe("workspace:*");
          }
        }
      }
    });
  });
});
