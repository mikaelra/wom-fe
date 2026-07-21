# More harness

An audit of the testing/CI harness already in place across `wom-fe`,
`wom-be`, and `wom-e2e`, plus the gaps identified when looking beyond
"does the code do what it claims."

## What's already in place

| Layer | Harness |
|---|---|
| **wom-be** (backend) | pytest with a **coverage ratchet** (`fail_under` in `pyproject.toml`, raised deliberately per-phase with a changelog of *why* in comments) · **Hypothesis** property-based tests for combat math (`tests/test_combat_properties.py`) · `ruff` + `mypy` (non-strict, scoped) · all three gate PRs via GitHub Actions |
| **wom-fe** (frontend) | Vitest unit/component tests · `eslint` with `react-hooks/exhaustive-deps` promoted to error (targets this codebase's most likely bug class — stale closures in socket effects) · `tsc --noEmit` as its own CI job · Playwright smoke spec (`e2e/lobby-smoke.spec.ts`) |
| **wom-e2e** (cross-repo) | Failure-injection harness — real browser + real Socket.IO + real Postgres, three named assertion *shapes* (`assertNoStall`/`assertHandlesDeparture`/`readState`) to avoid false-fail/false-pass patterns, a `matrix.yaml` registry with drift-checking (`npm run matrix:check`), env "knobs" for timers instead of sleeping through real durations, an isolated chaos tier for backend-restart, and `KNOWN_ISSUES.md` tracking real product bugs found by the suite |
| **Docs-as-harness** | `docs/CODEBASE_HARDENING_PLAN.md` — a living, phased plan with a self-audit, already substantially executed based on the coverage-ratchet changelog |

This is a mature "does the code do what it claims" harness across three
layers. What follows is what's missing outside that scope — things
unit/e2e tests structurally can't catch.

## Gaps worth adding

1. **Visual regression testing.** The last two merged PRs before this doc
   (duplicate React key producing a phantom resource card; kill-animation
   timing bugs — early death pose, stuck instakills) are exactly the class
   of bug that renders wrong but throws no error and passes every unit
   test. Playwright already supports `toHaveScreenshot()` natively (no new
   tool needed) — a small set of snapshot specs around `LobbyScene.tsx`'s
   animation states would catch this class before merge instead of after.

2. **Dependency vulnerability scanning.** No Dependabot config, and
   vulnerability alerts aren't enabled, on any of `wom-fe`/`wom-be`/
   `wom-e2e` (checked via the GitHub API). No `npm audit`/`pip-audit` step
   in any CI workflow either. Given `docs/MONETIZATION_PLAN.md` exists,
   this stops being purely academic soon — a known-CVE dependency becomes
   a liability the moment money moves through the app. Enabling Dependabot
   alerts + a `dependabot.yml` for version PRs is a ~10-minute fix.

3. **Runtime error tracking (production, not CI).** No Sentry or
   equivalent in `src` or the backend. Right now the only way to learn
   about a production bug is a player report or catching it yourself.
   Given this is a real-time socket app with exactly the class of
   state-desync bugs `wom-e2e/KNOWN_ISSUES.md` documents (e.g. #6,
   connection-lost not reflected in the 3D canvas), a lightweight
   client+server error tracker would surface these from real traffic
   instead of requiring a spec that already reproduces them.

4. **Uptime/alerting on the deploy target.** `docker-compose.yml` only has
   a Postgres healthcheck; nothing external monitors the production VM or
   pages on `wom-be`/`wom-fe` going down. Combined with `wom-e2e`'s README
   noting lobby state is single-instance/in-memory with "nothing to fail
   over to," an outage today is silent until a player notices. A
   free-tier uptime pinger (UptimeRobot, Healthchecks.io, or a scheduled
   GH Actions job hitting `/healthz`) closes that loop cheaply.

5. **Contract testing between the three repos.** `wom-e2e/lib/wire.ts` is
   explicitly a manually mirrored copy of `wom-be/docs/PROTOCOL.md`'s wire
   types, and `wom-fe` only has zod validation on a handful of files
   despite it being a dependency — Phase 1 of `CODEBASE_HARDENING_PLAN.md`
   is partially, not fully, adopted. Three independently-deployed repos
   with a hand-copied contract is a drift risk no single repo's unit tests
   can catch. A schema-drift check (generate a schema from the backend's
   dataclasses and diff it against the frontend zod schemas / `wire.ts` in
   CI) would catch protocol changes before they reach e2e or production.

6. **Branch protection.** Neither `wom-fe`'s `master` nor `wom-be`'s
   `main` has any protection rule (confirmed via the API — both 404
   "Branch not protected"). Nothing stops a direct force-push bypassing CI
   entirely. Lower severity since the deploy job already gates on
   `needs: [lint, test, typecheck, e2e]` for normal pushes, but requiring
   the existing status checks and disallowing force-push is a one-click
   fix that removes a real bypass path.

7. **Load/capacity testing.** No k6/artillery/locust anywhere. Given the
   single-VM, in-memory, no-replica architecture `wom-e2e`'s README calls
   out, there's currently no data on how many concurrent lobbies the box
   tolerates before falling over — worth knowing before, not after,
   monetization drives real concurrent load.

## Suggested starting point

Dependabot alerts (10 minutes, real risk once money moves through the
app) and Playwright screenshot regression on the animation states that
just caused two consecutive bugs — the latter also extends a harness
style (`wom-e2e`'s assertion-shape discipline) already proven valuable
here.
