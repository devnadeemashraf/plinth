# Session Continuity Protocol (Fresh & Continued Sessions)

This protocol guarantees that **any** Gemini session—whether brand new with zero chat history or 40 turns deep—picks up `plinth` with 100% precision and zero rework.

---

## Protocol A: Starting a Fresh Session

When a user starts a new chat (or opens a new Gemini CLI / Antigravity workspace), execute these exact steps BEFORE writing a single line of code:

1. **Load Control Plane:** Read `GEMINI.md` -> `docs/ai/PROJECT_STATE.md` -> last 2 entries of `docs/ai/SESSION_LOG.md`.
2. **Verify Local Reality:** Check what files already exist in the repo (`git status`, directory tree) and run `pnpm verify` if `package.json` already exists so you never trust stale assumptions.
3. **Sync Target Scope:** Read the active chunk's specification in `docs/ROADMAP.md` (and `docs/specs/<chunk>.md` if present) + the relevant section of `docs/EDD.md`.
4. **Confirm Plan in 3 Lines:** State to the user:
   - Current verified state (from `PROJECT_STATE.md` + local repo),
   - Active chunk/task being executed,
   - Any live docs / latest package versions you are about to check before writing tests.
5. **Begin Strict TDD (Phase 3) -> Adversarial Audit (Phase 4).**

---

## Protocol B: Continuing an Active Session

When continuing inside an existing session (e.g., user says "proceed to C03", "fix this bug", or "add a new billing feature"):

1. Re-check `docs/ai/PROJECT_STATE.md` to ensure all dependencies of the requested chunk/feature are marked `DONE`.
2. If the user asks to change an architectural decision locked in `docs/EDD.md` or `docs/adr/0001-core-architectural-decisions.md`, **pause and flag the trade-off explicitly**, get user sign-off, and record a new ADR (`docs/adr/000N-*.md`) before coding.
3. Run the **Live Research Protocol** (`docs/ai/LIVE_RESEARCH_PROTOCOL.md`) for any new library or API touched in this turn.

---

## Protocol C: Mandatory Session Handoff (End of Every Chunk or Pause)

NEVER finish a chunk or stop mid-work without leaving the repo self-describing for the next session:

1. **Run Full Verification:** Execute `pnpm verify` (and record exact pass/fail output).
2. **Update `docs/ai/PROJECT_STATE.md`:**
   - Update the Chunk Status table (`NOT_STARTED` | `IN_PROGRESS` | `AUDITED` | `DONE`).
   - Record any newly added/pinned exact dependency versions in the Verified Toolchain table.
   - Write the exact **Next Session Starting Point** (which chunk or partial step comes next, and any open P2 items deferred).
3. **Append to `docs/ai/SESSION_LOG.md`:**
   - Date, chunk/task ID, files created/modified, live docs/RFCs consulted, audit findings remediated, and verification results.
4. **Keep Git Clean:** Ensure no untracked temp files, stray debug logs, or unformatted files remain.
