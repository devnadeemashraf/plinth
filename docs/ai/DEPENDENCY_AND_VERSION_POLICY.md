# Dependency & Latest-Version Enforcement Policy

This policy guarantees two things simultaneously:
1. **`plinth` always adopts the verified latest stable versions** of every library at the time a chunk is built.
2. **Installed versions never silently drift** across machines, CI, Docker builds, or fresh `pnpm install` runs.

---

## Mandatory 5-Step Procedure Before Adding or Upgrading Any Package

**NEVER guess or hardcode a package version from AI training memory.** Execute these steps every single time a new package is introduced (or during an intentional dependency refresh):

### Step 1 — Query Live Registry for Exact Latest Stable Version
Run via shell (preferred) or live web lookup against npmjs.com / official GitHub Releases:
```bash
pnpm view <package-name> dist-tags --json
pnpm view <package-name> version engines peerDependencies --json
```
- Verify the **`latest`** dist-tag (avoid `-alpha`, `-beta`, `-rc` unless explicitly approved by the user, such as a specific TS 7.x release if needed).
- Verify `engines.node` supports **Node.js 24+ / 26 LTS**.
- Verify ESM compatibility and TypeScript 7.0 typechecking compatibility.

### Step 2 — Check Official Changelog & Breaking Changes Online
Before installing a major or minor bump (e.g., Zod v4, Biome v2, Fastify v5, Express v5, Drizzle ORM, Vitest):
- Fetch the library's official release notes / migration guide online (per `docs/ai/LIVE_RESEARCH_PROTOCOL.md`).
- Confirm exact config syntax (for example, matching `biome.json`'s `$schema` URL to the exact installed `@biomejs/biome` version).

### Step 3 — Pin the Exact Version in `pnpm-workspace.yaml` `catalog:`
**NEVER** put `^` or `~` in any `package.json`. Put the exact version string inside root `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"

# Prevent `pnpm add` from ever writing ^ or ~
saveExact: true

# Enforce centralized exact versions across all @plinth/* packages
catalogMode: strict

# Supply-chain protection: block packages published < 24 hours ago (1440 min)
minimumReleaseAge: 1440

catalog:
  "@biomejs/biome": "<EXACT_LATEST_VERIFIED>"
  "@types/node": "<EXACT_LATEST_VERIFIED>"
  "@vitest/coverage-v8": "<EXACT_LATEST_VERIFIED>"
  "typescript": "<EXACT_LATEST_VERIFIED>"
  "vitest": "<EXACT_LATEST_VERIFIED>"
  "zod": "<EXACT_LATEST_VERIFIED>"
```

Then in every workspace `package.json`, reference `"catalog:"`:
```json
{
  "dependencies": {
    "zod": "catalog:"
  }
}
```

### Step 4 — Align `packageManager` to Local pnpm 12+
Check `pnpm -v` locally and set root `package.json`:
```json
"packageManager": "pnpm@<EXACT_LOCAL_PNPM_12_VERSION>"
```
(Never pin pnpm v10 when the environment runs pnpm v12+.)

### Step 5 — Lock, Audit & Record
1. Run `pnpm install` to update `pnpm-lock.yaml` (always commit `pnpm-lock.yaml`).
2. In CI and Dockerfiles, always run `pnpm install --frozen-lockfile`.
3. Run `pnpm audit --audit-level=high`.
4. Record any newly added major dependencies in `docs/ai/PROJECT_STATE.md`.

---

## Handling `minimumReleaseAge` Edge Cases
If a brand-new security patch (< 24h old) is genuinely required immediately, ask the user before temporarily adding that specific package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, and remove the exclusion once 24 hours have passed.
