# Changelog

All notable wire-visible or user-visible changes to this repo. Store listings
require release notes on every submission (`docs/MOBILE_AND_STEAM_PLAN.md`
§4.5), so this starts now rather than being reconstructed later.

Versioning is SemVer against `wom-be/docs/PROTOCOL.md`'s `PROTOCOL_VERSION`
(mirrored here as `src/config.ts`'s `PROTOCOL_VERSION`), not against feature
count.

## [Unreleased]

### Changed
- Lobby URLs moved from `/lobby/<id>` to `/lobby?id=<id>` (the dynamic path
  segment couldn't be statically exported — `docs/MOBILE_AND_STEAM_PLAN.md`
  §5.3). Old-shape links (already shared via copy-link/QR) keep working —
  `/lobby/<id>` now redirects to the new shape rather than 404ing.
- `next.config.ts`'s build output is conditional on `BUILD_TARGET=native`:
  `output: "export"` (a native shell's static bundle) vs. today's
  `"standalone"` (the web deploy, unaffected either way).

### Added
- `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_NUMBER`, derived from `git
  describe`/`git rev-list --count` in CI and shown on the settings page —
  "which build are you on" is the first question in any store support
  ticket.
- Every request now sends `X-Protocol-Version` (REST) or
  `auth.protocol_version` (Socket.IO connect), so wom-be can recognize and
  reject a client it no longer supports instead of failing some other way.

## [0.1.0] - 2026-08-12

Starting tag for semantic versioning (`docs/MOBILE_AND_STEAM_PLAN.md` §4.1).
Everything before this point is undifferentiated history.
