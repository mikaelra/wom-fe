# More harness

An audit of the testing/CI harness already in place across `wom-fe`,
`wom-be`, and `wom-e2e`, plus the gaps identified when looking beyond
"does the code do what it claims."

**Status as of 2026-07-23:** 3 of 7 gaps closed (#2, #3, #6). See status
notes under each item.

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

1. **Visual regression testing.** ⬜ Not started. The last two merged PRs
   before this doc (duplicate React key producing a phantom resource card;
   kill-animation timing bugs — early death pose, stuck instakills) are
   exactly the class of bug that renders wrong but throws no error and
   passes every unit test. Playwright already supports `toHaveScreenshot()`
   natively (no new tool needed) — a small set of snapshot specs around
   `LobbyScene.tsx`'s animation states would catch this class before merge
   instead of after.

2. **Dependency vulnerability scanning.** ✅ Done (2026-07-23). Vulnerability
   alerts and automated security-fix PRs are enabled on all three repos —
   the first scan surfaced 49 vulnerabilities on `wom-fe`'s default branch
   alone (25 high, 20 moderate, 4 low), now being remediated automatically.
   `dependabot.yml` (weekly version-update PRs for npm/pip/docker/
   github-actions) is live on `wom-fe`'s `master` and `wom-be`'s `main`
   (landed via the Sentry PRs below, `wom-e2e`'s own `dependabot.yml` PR
   (`wom-e2e#18`) is still open). Still no `npm audit`/`pip-audit` step in
   CI itself, though that's largely superseded by the above.

3. **Runtime error tracking (production, not CI).** ✅ Done (2026-07-23,
   `wom-fe#222` + `wom-be#131`, merged and deployed). `@sentry/nextjs`
   covers `wom-fe`'s client/server/edge runtimes, the existing
   `ErrorBoundary` (previously `console.error`-only), and `global-error.tsx`
   for root-layout failures. `wom-be` uses `FlaskIntegration` for HTTP
   routes plus a dedicated `on_error_default` handler for Socket.IO events
   specifically, since those bypass Flask's request dispatch and would
   otherwise stay invisible to the HTTP-only integration — the exact
   state-desync class `wom-e2e/KNOWN_ISSUES.md` #6 describes. Default
   alerting is whatever Sentry's per-project default rule does (email on
   new issue); no Slack/PagerDuty integration or spike-based alert rules
   configured yet.

4. **Uptime/alerting on the deploy target.** ⬜ Not started.
   `docker-compose.yml` only has
   a Postgres healthcheck; nothing external monitors the production VM or
   pages on `wom-be`/`wom-fe` going down. Combined with `wom-e2e`'s README
   noting lobby state is single-instance/in-memory with "nothing to fail
   over to," an outage today is silent until a player notices. A
   free-tier uptime pinger (UptimeRobot, Healthchecks.io, or a scheduled
   GH Actions job hitting `/healthz`) closes that loop cheaply.

5. **Contract testing between the three repos.** ⬜ Not started.
   `wom-e2e/lib/wire.ts` is
   explicitly a manually mirrored copy of `wom-be/docs/PROTOCOL.md`'s wire
   types, and `wom-fe` only has zod validation on a handful of files
   despite it being a dependency — Phase 1 of `CODEBASE_HARDENING_PLAN.md`
   is partially, not fully, adopted. Three independently-deployed repos
   with a hand-copied contract is a drift risk no single repo's unit tests
   can catch. A schema-drift check (generate a schema from the backend's
   dataclasses and diff it against the frontend zod schemas / `wire.ts` in
   CI) would catch protocol changes before they reach e2e or production.

6. **Branch protection.** ✅ Done (2026-07-23). All three default branches
   (`wom-fe:master`, `wom-be:main`, `wom-e2e:main`) now require their
   PR-triggered status checks to pass (`lint`/`test`/`typecheck`/`e2e` on
   `wom-fe`; `lint`/`test`/`typecheck` on `wom-be`; none on `wom-e2e`, since
   it has no `pull_request`-triggered CI to require), block force-pushes
   and branch deletion, and — since each repo has exactly one admin —
   `enforce_admins` is on too, so the protection isn't a no-op bypassable
   by the owner.

7. **Load/capacity testing.** ⬜ Not started. No k6/artillery/locust anywhere. Given the
   single-VM, in-memory, no-replica architecture `wom-e2e`'s README calls
   out, there's currently no data on how many concurrent lobbies the box
   tolerates before falling over — worth knowing before, not after,
   monetization drives real concurrent load.

## Suggested starting point

~~Dependabot alerts~~ and ~~branch protection~~ are done, and runtime
error tracking (Sentry) landed alongside them, ahead of its original
ranking, since it was cheap once the other two were already in flight.

Loose ends from what's already merged:
- Merge `wom-e2e#18` (the one remaining standalone `dependabot.yml` PR —
  `wom-fe`/`wom-be`'s equivalents landed already, see #2 above).
- Configure a real Sentry alert rule (Slack/PagerDuty, or at least a
  spike-based rule) — the default "email on new issue" rule is a weak
  substitute for actually noticing a production incident.

Next unclaimed item: **visual regression testing** (#1) — Playwright
screenshot regression on the animation states that caused the last two
consecutive shipped bugs (duplicate-key resource card, kill-animation
timing), extending a harness style (`wom-e2e`'s assertion-shape
discipline) already proven valuable here.
