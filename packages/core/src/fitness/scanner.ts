import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ArchitecturalViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly detail: string;
}

export interface FileScanResult {
  readonly file: string;
  readonly violations: readonly ArchitecturalViolation[];
}

export interface ArchitectureScanReport {
  readonly scannedFiles: number;
  readonly violations: readonly ArchitecturalViolation[];
}

const FORBIDDEN_PACKAGES = [
  "fastify",
  "express",
  "hono",
  "drizzle-orm",
  "pg",
  "postgres",
  "mysql2",
  "better-sqlite3",
  "ioredis",
  "redis",
  "bullmq",
  "stripe",
  "razorpay",
  "nodemailer",
  "@aws-sdk/",
  "@plinth/adapter-",
];

// Split patterns to prevent scanner source itself from self-matching
const PROC_ENV_REGEX = new RegExp(["\\bprocess", "\\.env\\b"].join(""));
const PROC_BRACKET_REGEX = new RegExp(["\\bprocess\\s*\\[\\s*['\"]", "env['\"]\\s*\\]"].join(""));
const IMPORT_ENV_REGEX = new RegExp(
  ["\\bimport\\s+.*\\b(?:env)\\b.*from\\s+['\"](?:node:)?", "process['\"]"].join(""),
);
const GLOBAL_PROC_REGEX = new RegExp(
  ["\\bglobalThis\\s*(?:\\.\\s*|\\s*\\[\\s*['\"])", "process"].join(""),
);
const CONFIG_LEAK_DETAIL = [
  "Direct process",
  ".env or node:process env access outside src/config/. Inject typed AppConfig instead.",
].join("");

const STATE_CODE = 0;
const STATE_SINGLE_QUOTE = 1;
const STATE_DOUBLE_QUOTE = 2;
const STATE_TEMPLATE_LITERAL = 3;
const STATE_LINE_COMMENT = 4;
const STATE_BLOCK_COMMENT = 5;
type LexerState = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Single-pass string/template-aware lexer that strips comments while preserving
 * string literals and line numbers.
 * Resets unescaped single/double quotes at newlines per ECMAScript grammar.
 */
export function stripCommentsPreservingStrings(source: string): string {
  let output = "";
  let i = 0;
  const len = source.length;
  let state: LexerState = STATE_CODE;

  while (i < len) {
    const char = source[i] ?? "";
    const nextChar = source[i + 1] ?? "";

    switch (state) {
      case STATE_CODE: {
        if (char === "/" && nextChar === "/") {
          state = STATE_LINE_COMMENT;
          i += 2;
        } else if (char === "/" && nextChar === "*") {
          state = STATE_BLOCK_COMMENT;
          i += 2;
        } else if (char === "'") {
          state = STATE_SINGLE_QUOTE;
          output += char;
          i += 1;
        } else if (char === '"') {
          state = STATE_DOUBLE_QUOTE;
          output += char;
          i += 1;
        } else if (char === "`") {
          state = STATE_TEMPLATE_LITERAL;
          output += char;
          i += 1;
        } else {
          output += char;
          i += 1;
        }
        break;
      }

      case STATE_SINGLE_QUOTE: {
        output += char;
        if (char === "\\" && i + 1 < len) {
          // Escaped char inside single quote
          output += nextChar;
          i += 2;
        } else if (char === "'") {
          state = STATE_CODE;
          i += 1;
        } else if (char === "\n") {
          // ECMAScript: unescaped line break ends single-quoted string
          state = STATE_CODE;
          i += 1;
        } else {
          i += 1;
        }
        break;
      }

      case STATE_DOUBLE_QUOTE: {
        output += char;
        if (char === "\\" && i + 1 < len) {
          // Escaped char inside double quote
          output += nextChar;
          i += 2;
        } else if (char === '"') {
          state = STATE_CODE;
          i += 1;
        } else if (char === "\n") {
          // ECMAScript: unescaped line break ends double-quoted string
          state = STATE_CODE;
          i += 1;
        } else {
          i += 1;
        }
        break;
      }

      case STATE_TEMPLATE_LITERAL: {
        output += char;
        if (char === "\\" && i + 1 < len) {
          output += nextChar;
          i += 2;
        } else if (char === "`") {
          state = STATE_CODE;
          i += 1;
        } else {
          i += 1;
        }
        break;
      }

      case STATE_LINE_COMMENT: {
        if (char === "\n") {
          state = STATE_CODE;
          output += "\n";
        }
        i += 1;
        break;
      }

      case STATE_BLOCK_COMMENT: {
        if (char === "*" && nextChar === "/") {
          state = STATE_CODE;
          i += 2;
        } else {
          if (char === "\n") {
            output += "\n";
          }
          i += 1;
        }
        break;
      }
    }
  }

  return output;
}

function isForbiddenImport(modulePath: string): boolean {
  for (const pkg of FORBIDDEN_PACKAGES) {
    if (modulePath === pkg || modulePath.startsWith(`${pkg}/`) || modulePath.startsWith(pkg)) {
      return true;
    }
  }
  // Check relative escapes to adapter packages (e.g. "../../adapter-http-fastify")
  if (modulePath.includes("adapter-")) {
    return true;
  }
  return false;
}

/**
 * Scans a single source file's contents for hexagonal and isolation rule violations.
 */
export function scanSourceText(filePath: string, rawSource: string): FileScanResult {
  const violations: ArchitecturalViolation[] = [];
  const normalizedPath = filePath.replace(/\\/g, "/");
  const isConfigFile = normalizedPath.includes("/config/");
  const isCoreOrModule =
    normalizedPath.includes("packages/core/src/") || normalizedPath.includes("packages/modules/");

  // Strip comments without eating string literals or line counts
  const stripped = stripCommentsPreservingStrings(rawSource);
  const lines = stripped.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const line = lines[lineIdx] ?? "";

    if (isCoreOrModule) {
      // 1. Static import/export checks
      const staticImportMatch = line.match(
        /(?:import|export)\s+.*?from\s+['"\x60]([^'"\x60]+)['"\x60]/,
      );
      if (staticImportMatch) {
        const targetModule = staticImportMatch[1] ?? "";
        if (isForbiddenImport(targetModule)) {
          violations.push({
            file: filePath,
            line: lineNum,
            rule: "HEXAGONAL_LEAK_STATIC_IMPORT",
            detail: `Forbidden infrastructure dependency '${targetModule}' imported in domain/core`,
          });
        }
      }

      // 2. Dynamic import checks: import('...') or import(`...`)
      const dynamicImportMatch = line.match(/\bimport\s*\(\s*['"\x60]([^'"\x60]+)['"\x60]\s*\)/);
      if (dynamicImportMatch) {
        const targetModule = dynamicImportMatch[1] ?? "";
        if (isForbiddenImport(targetModule)) {
          violations.push({
            file: filePath,
            line: lineNum,
            rule: "HEXAGONAL_LEAK_DYNAMIC_IMPORT",
            detail: `Forbidden dynamic infrastructure import '${targetModule}' in domain/core`,
          });
        }
      }

      // 3. CommonJS require checks
      const requireMatch = line.match(/\brequire\s*\(\s*['"\x60]([^'"\x60]+)['"\x60]\s*\)/);
      if (requireMatch) {
        const targetModule = requireMatch[1] ?? "";
        if (isForbiddenImport(targetModule)) {
          violations.push({
            file: filePath,
            line: lineNum,
            rule: "HEXAGONAL_LEAK_REQUIRE",
            detail: `Forbidden CommonJS require('${targetModule}') in domain/core`,
          });
        }
      }
    }

    // 4. Variable relative import traversal checks (enforcing path aliases)
    const relativeImportMatch = line.match(
      /(?:import|export)\s+.*?from\s+['"\x60]([^'"\x60]+)['"\x60]/,
    );
    if (relativeImportMatch) {
      const targetModule = relativeImportMatch[1] ?? "";
      if (/\.\.\/+(?:src|packages)\b/.test(targetModule) || /\.\.\/\.\.\//.test(targetModule)) {
        violations.push({
          file: filePath,
          line: lineNum,
          rule: "VARIABLE_RELATIVE_IMPORT",
          detail: `Forbidden variable relative import '${targetModule}'. Use canonical path alias (@/* or @plinth/*) instead.`,
        });
      }
    }

    // 5. Dynamic variable import checks (import(var) or require(var))
    const dynamicVarMatch = line.match(
      /\b(?:import|require)\s*\(\s*(?![`'"])([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/,
    );
    if (dynamicVarMatch) {
      const varName = dynamicVarMatch[1] ?? "";
      violations.push({
        file: filePath,
        line: lineNum,
        rule: "DYNAMIC_VARIABLE_IMPORT",
        detail: `Forbidden dynamic variable import '${varName}'. Use static imports with path aliases (@/* or @plinth/*).`,
      });
    }

    // 4. process.env outside src/config/
    if (!isConfigFile) {
      if (
        PROC_ENV_REGEX.test(line) ||
        PROC_BRACKET_REGEX.test(line) ||
        IMPORT_ENV_REGEX.test(line) ||
        GLOBAL_PROC_REGEX.test(line)
      ) {
        violations.push({
          file: filePath,
          line: lineNum,
          rule: "CONFIG_ISOLATION_LEAK",
          detail: CONFIG_LEAK_DETAIL,
        });
      }
    }
  }

  return {
    file: filePath,
    violations,
  };
}

async function collectFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name !== "node_modules" &&
          entry.name !== "dist" &&
          entry.name !== ".git" &&
          entry.name !== "coverage"
        ) {
          await collectFiles(fullPath, fileList);
        }
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
        fileList.push(fullPath);
      }
    }
  } catch {
    // If directory doesn't exist, return empty list gracefully
  }
  return fileList;
}

/**
 * Scans all source files under `rootDir/packages` for architectural compliance.
 */
export async function scanArchitecture(rootDir: string): Promise<ArchitectureScanReport> {
  const packagesDir = join(rootDir, "packages");
  let files: string[] = [];

  try {
    const st = await stat(packagesDir);
    if (st.isDirectory()) {
      files = await collectFiles(packagesDir);
    }
  } catch {
    return { scannedFiles: 0, violations: [] };
  }

  const allViolations: ArchitecturalViolation[] = [];
  let scannedCount = 0;

  for (const file of files) {
    const normalized = file.replace(/\\/g, "/");
    // Only scan production src folders (skip tests)
    if (normalized.includes("/src/")) {
      const content = await readFile(file, "utf8");
      const result = scanSourceText(relative(rootDir, file), content);
      allViolations.push(...result.violations);
      scannedCount += 1;
    }
  }

  return {
    scannedFiles: scannedCount,
    violations: allViolations,
  };
}
