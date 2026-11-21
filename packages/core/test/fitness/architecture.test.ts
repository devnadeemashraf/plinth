import { describe, expect, it } from "vitest";
import { scanArchitecture, scanSourceText } from "@/fitness/scanner.js";

describe("fitness / architectural scanner (5-category TDD + Evasion Detection)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should report zero violations for compliant core code", () => {
      const cleanSource = `
        import { Result, ok } from "./result.js";
        export function compute(): Result<number> {
          return ok(42);
        }
      `;
      const result = scanSourceText("packages/core/src/domain/service.ts", cleanSource);
      expect(result.violations).toHaveLength(0);
    });

    it("should allow process.env inside packages/core/src/config/", () => {
      const configSource = `
        export const port = Number(process.env.PORT ?? 3000);
      `;
      const result = scanSourceText("packages/core/src/config/loader.ts", configSource);
      expect(result.violations).toHaveLength(0);
    });

    it("should pass the real repository architecture fitness scan", async () => {
      // Root of repository is two levels up from packages/core
      const repoRoot = new URL("../../../../", import.meta.url).pathname.replace(
        /^\/([A-Z]:)/i,
        "$1",
      );
      const result = await scanArchitecture(repoRoot);
      expect(result.violations).toEqual([]);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle empty files, whitespace-only, and comment-only files cleanly", () => {
      expect(scanSourceText("packages/core/src/empty.ts", "").violations).toHaveLength(0);
      expect(scanSourceText("packages/core/src/blank.ts", "   \n\n\t  ").violations).toHaveLength(
        0,
      );
      expect(
        scanSourceText(
          "packages/core/src/comments.ts",
          "// Just comments\n/* Multiline\n * comment\n */",
        ).violations,
      ).toHaveLength(0);
    });

    it("should not falsely trigger on strings containing comment syntax", () => {
      const source = `
        export const docUrl = "https://fastify.io/docs";
        export const note = "/* not a comment */";
        export const pattern = "//not-a-comment";
      `;
      const result = scanSourceText("packages/core/src/primitives/constants.ts", source);
      expect(result.violations).toHaveLength(0);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce identical scan results across multiple invocations", () => {
      const input = `
        import express from "express";
        const val = process.env.SECRET;
      `;
      const res1 = scanSourceText("packages/core/src/bad.ts", input);
      const res2 = scanSourceText("packages/core/src/bad.ts", input);
      expect(res1).toEqual(res2);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should return empty violations on non-existent directories without unhandled crashes", async () => {
      const result = await scanArchitecture("./non-existent-dir-for-test-xyz");
      expect(result.scannedFiles).toBe(0);
      expect(result.violations).toHaveLength(0);
    });
  });

  // Category 5: Security & Abuse Cases (Evasion Attacks)
  describe("Category 5: Security & Abuse Cases (Evasion Attacks)", () => {
    it("should catch forbidden static imports (fastify, express, drizzle, etc.)", () => {
      const badImports = [
        `import fastify from "fastify";`,
        `import { drizzle } from "drizzle-orm";`,
        `import Redis from "ioredis";`,
        `import Stripe from "stripe";`,
        `import Razorpay from "razorpay";`,
        `import nodemailer from "nodemailer";`,
        `import { S3Client } from "@aws-sdk/client-s3";`,
        `import { FastifyAdapter } from "@plinth/adapter-http-fastify";`,
        `export * from "express";`,
      ];

      for (const badImport of badImports) {
        const result = scanSourceText("packages/core/src/leaky.ts", badImport);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it("should catch dynamic imports including backtick template literals", () => {
      const dynamicSources = [
        `const f = await import("fastify");`,
        `const e = await import('express');`,
        "const h = await import(`hono`);",
      ];

      for (const source of dynamicSources) {
        const result = scanSourceText("packages/core/src/dynamic.ts", source);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it("should catch require() imports of forbidden packages", () => {
      const requireSources = [
        `const fastify = require("fastify");`,
        `const express = require('express');`,
      ];

      for (const source of requireSources) {
        const result = scanSourceText("packages/core/src/req.ts", source);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it("should catch relative adapter escapes", () => {
      const escapeSources = [
        `import { FastifyServer } from "../../adapter-http-fastify/src/index.js";`,
        `import { SqliteDb } from "../../../packages/adapter-db-sqlite/src/index.js";`,
      ];

      for (const source of escapeSources) {
        const result = scanSourceText("packages/core/src/escape.ts", source);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it("should catch process.env and node:process evasion attempts outside src/config/", () => {
      const evasions = [
        `const secret = process.env.API_KEY;`,
        `const secret = process["env"]["API_KEY"];`,
        `const secret = process['env']['API_KEY'];`,
        `const secret = globalThis.process.env.API_KEY;`,
        `const secret = globalThis["process"].env.API_KEY;`,
        `import { env } from "node:process";`,
        `import { env } from "process";`,
      ];

      for (const evasion of evasions) {
        const result = scanSourceText("packages/core/src/domain/user.ts", evasion);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it("should correctly handle single-line comments containing URLs without eating code on next lines", () => {
      const evasionCode = `
        // Check docs at https://fastify.io for more info
        import fastify from "fastify";
      `;
      const result = scanSourceText("packages/core/src/tricky.ts", evasionCode);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should catch variable relative path traversal (../../src/...) and enforce path aliases", () => {
      const variableRelativeImports = [
        `import { loadConfig } from "../../src/config/loader.js";`,
        `import { generateUuidV7 } from "../../../src/primitives/uuidv7.js";`,
        `import { brand } from "../../packages/core/src/primitives/brand-types.js";`,
      ];

      for (const src of variableRelativeImports) {
        const result = scanSourceText("packages/core/test/sample.test.ts", src);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]?.rule).toBe("VARIABLE_RELATIVE_IMPORT");
      }
    });

    it("should catch dynamic variable imports (import(variable) or require(variable))", () => {
      const dynamicVariableImports = [
        "const mod = await import(dynamicPath);",
        "const pkg = require(moduleName);",
      ];

      for (const src of dynamicVariableImports) {
        const result = scanSourceText("packages/core/src/dynamic-var.ts", src);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0]?.rule).toBe("DYNAMIC_VARIABLE_IMPORT");
      }
    });

    it("should allow canonical path aliases (@/*, @plinth/*, #/*)", () => {
      const cleanAliases = [
        `import { loadConfig } from "@/config/loader.js";`,
        `import { ok } from "@plinth/core";`,
        `import { generateUuidV7 } from "#primitives/uuidv7.js";`,
      ];

      for (const src of cleanAliases) {
        const result = scanSourceText("packages/core/test/alias.test.ts", src);
        expect(result.violations).toHaveLength(0);
      }
    });
  });
});
