# Chunk C01 Specification — Monorepo Foundation, Toolchain, Fail-Fast Config & Fitness Harness

**Status:** Pre-Audited & Ready to Materialize  
**Dependencies:** None

---

## 1. Exact Scope & Files to Create
- `pnpm-workspace.yaml` (with `saveExact: true`, `catalogMode: strict`, `minimumReleaseAge: 1440`, and `catalog:` pinned to **live-verified exact latest versions**)
- `package.json` (root scripts: `typecheck`, `lint`, `format`, `test`, `test:watch`, `test:coverage`, `test:fitness`, `verify`; `packageManager` matched to local `pnpm -v` 12.x; `"catalog:"` devDeps)
- `tsconfig.base.json` (TS 7.0 strict: `ES2024`, `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`)
- `biome.json` (`$schema` matched to exact installed Biome 2.x version; `noExplicitAny: "error"`, `noConsole: "error"`, `noNonNullAssertion: "error"`, `useImportType: "error"`, `useNodejsImportProtocol: "error"`)
- `vitest.config.ts` (v8 coverage thresholds >= 85% across lines, functions, branches, statements on `packages/core/src/**/*.ts`)
- `packages/core/package.json` & `packages/core/tsconfig.json`
- `packages/core/src/primitives/brand-types.ts` (`Brand<T, B>`, `UuidV7`, `TenantId`, `UserId`, `RequestId`, `IsoUtcTimestamp`)
- `packages/core/src/primitives/result.ts` (`ok`, `err`, `isOk`, `isErr`, `map`, `flatMap`, `unwrapOr`)
- `packages/core/src/primitives/uuidv7.ts` (RFC 9562 monotonic UUIDv7 generator with 12-bit sub-ms counter + NTP backward-clock monotonicity + `isUuidV7` + `extractUuidV7Timestamp`)
- `packages/core/src/config/schema.ts` & `packages/core/src/config/loader.ts` (Fail-fast Zod v4 env validation, deep freeze, secret redaction in `ConfigValidationError`)
- `packages/core/src/fitness/scanner.ts` (Hexagonal import & `process.env` isolation scanner)
- `packages/core/src/index.ts`
- `packages/core/test/{primitives/uuidv7,primitives/result,config/loader,fitness/architecture}.test.ts`

---

## 2. Pre-Audited Security & Reliability Invariants (MUST Be Included in C01)

These 4 findings were already discovered and fixed during our initial Phase 4 Audit of C01. Make sure all 4 + their regression tests are present:

1. **`[P1]` Key Entropy Enforcement (`schema.ts`):**
   - `MASTER_ENCRYPTION_KEY` must decode (64-char hex or 32-byte base64) to exactly 32 bytes, have no leading/trailing whitespace, match no placeholder patterns (`changeme`, `secret`, `default`, `password`, `test-key`, `replace-me`), AND contain **at least 16 distinct byte values** (`new Set(decoded).size >= 16`) so all-zero or repeated-byte keys fail fast.
2. **`[P1]` Strict CORS Origin Validation (`schema.ts`):**
   - Wildcard `*` forbidden in `production`.
   - Every origin parsed with `new URL(origin)`: must use `http:` or `https:`, must satisfy `parsed.origin === origin` (rejects paths, queries, fragments, and trailing slashes), and in `production` must use `https:`.
3. **`[P1]` String-Aware Fitness Lexer & Evasion Detection (`scanner.ts`):**
   - Strip `//` and `/* */` comments with a single-pass string/template-aware lexer so `"https://..."` never eats the rest of a line.
   - Catch static `import`/`export ... from`, dynamic `import("...")` / ``import(`...`)``, `require(...)`, relative `adapter-*` path traversal, `process.env`, `process["env"]`, and `import { env } from "node:process"` outside `src/config/`.
4. **`[P2]` Startup CIDR Validation (`schema.ts`):**
   - Validate every entry in `ADMIN_ALLOWED_CIDRS` using `node:net` `isIP()` and prefix bounds (`0..32` for IPv4, `0..128` for IPv6).

---

## 3. Verification Commands
Before marking C01 `DONE` in `docs/ai/PROJECT_STATE.md`:
```bash
pnpm install
pnpm verify
```
