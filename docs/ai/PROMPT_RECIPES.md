# Gemini Prompt Recipes for Building & Evolving `plinth`

Copy and paste these exact prompts into **Gemini CLI**, **Antigravity**, or any fresh Gemini chat session.

---

## 1. Fresh Session — Start or Resume Building the Next Chunk

```text
Read GEMINI.md, docs/ai/PROJECT_STATE.md, and the last entry of docs/ai/SESSION_LOG.md.
Activate the `plinth-chunk-builder` skill and execute the next incomplete chunk from docs/ROADMAP.md.
Remember:
1) Verify exact latest stable package versions via live npm lookup and pin them in pnpm-workspace.yaml catalog: (no ^ or ~).
2) Check live official docs online before writing code—never rely on memory.
3) Follow strict TDD (5-category test matrix -> failing tests -> minimal clean code -> pnpm verify).
4) Run the full Phase 4 Adversarial Audit and fix all P0/P1 findings with regression tests.
5) Update docs/ai/PROJECT_STATE.md and docs/ai/SESSION_LOG.md when done.
6) For Chunks that require manual review or milestones that have something for end user to test and demo, share exact steps.
7) Write out the exact commit steps along with a conventional commit message and a one liner title of what the chunk update was about.
```

## 2. Fresh Session — Materialize & Verify Chunk C01 Right Now

```text
Read GEMINI.md, docs/ai/PROJECT_STATE.md, and docs/specs/C01-FOUNDATION-SPEC.md.
Activate `plinth-live-research-and-versions` and `plinth-chunk-builder`.
Query the live npm registry for the exact latest stable versions of @biomejs/biome, @types/node, typescript (7.x), vitest, @vitest/coverage-v8, and zod (4.x), and check my local `pnpm -v` and `node -v`.
Materialize all Chunk C01 files (including all 4 pre-audited security remediations and exact pnpm-workspace.yaml catalog: pins), run `pnpm install && pnpm verify`, confirm every check passes, and update PROJECT_STATE.md and SESSION_LOG.md.
```

## 3. Add a Real Business Feature After `plinth` Is Built

```text
Read GEMINI.md and docs/ai/ARCHITECTURE_RULES.md.
Activate `plinth-add-feature-module`.
I want to add a new business module: [DESCRIBE YOUR BUSINESS REQUIREMENTS HERE].
Walk me through any critical ambiguities first if needed, then build it strictly following plinth's hexagonal contracts, branded TenantContext isolation, BigInt bitmask permissions, strict TDD, and Phase 4 adversarial audit.
```

## 4. Add or Swap an Adapter (e.g., New Cache, Storage, Email, or Billing Provider)

```text
Read GEMINI.md and docs/ai/ARCHITECTURE_RULES.md.
Activate `plinth-add-adapter` and `plinth-live-research-and-versions`.
Build an adapter for [PROVIDER NAME] implementing the [PORT NAME] port.
Verify latest SDK docs online, pin exact versions in pnpm-workspace.yaml catalog:, pass 100% of the shared Contract Test Suite, and write its 1-page Swap-to-Production handbook in docs/adapters/.
```

## 5. Deep Security & Reliability Audit of Existing Code

```text
Activate `plinth-security-audit`.
Perform a hostile Principal Engineer & Security Audit of [PATH / CHUNK ID] against docs/ai/AUDIT_CHECKLIST.md and docs/ai/ARCHITECTURE_RULES.md.
Report every P0–P3 finding with exact file/symbol, exploit/failure trace, concrete code patch, and regression test.
```

## 6. Debug a Tricky Bug or Profile Performance

```text
Activate `plinth-debug-and-profile`.
Investigate [SYMPTOM / ERROR MESSAGE / SLOW ENDPOINT].
Search official docs, GitHub issues, and StackOverflow online before hypothesizing fixes. Reproduce with a failing regression test first, fix the root cause without weakening any quality gate, and verify with `pnpm verify`.
```

## 7. Refresh & Upgrade Dependencies Safely

```text
Activate `plinth-live-research-and-versions`.
Audit all packages in pnpm-workspace.yaml catalog: against live npm latest versions and official changelogs.
Summarize breaking changes and security advisories first; after my approval, update exact catalog pins, align biome.json $schema if Biome changed, run `pnpm install && pnpm verify && pnpm audit --audit-level=high`, and log the upgrade in SESSION_LOG.md.
```
