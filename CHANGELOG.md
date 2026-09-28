# Changelog

All notable wire-visible or user-visible changes to this repo. Store listings
require release notes on every submission (`docs/MOBILE_AND_STEAM_PLAN.md`
§4.5), so this starts now rather than being reconstructed later.

Versioning is SemVer against `wom-be/docs/PROTOCOL.md`'s `PROTOCOL_VERSION`
(mirrored here as `src/config.ts`'s `PROTOCOL_VERSION`), not against feature
count.

## [0.2.0] - 2026-09-28

### Security
- Ranked now requires a secret ranked ticket, or an authenticated account
  session, instead of a bare player name. Before this, anyone who knew a
  player's name could take over their seat in a live ranked match.
  (wom-fe#394, wom-be#227)

### Added
- Floating combat numbers: a red "-X" over whoever a hit actually landed on
  (both the attacker's and the target's view), a blue "0" over whoever just
  blocked. Requires wom-be#172 (`OutgoingEvent` now carries `damage`, so the
  attacker's own view shows the same number the target sees).
- Planetary aspects, generalized to all seven bodies (`docs/ASPECTS_PLAN.md`):
  conjunctions are now mutual — every body can donate colour to, and receive
  it from, every other body, each using its own orb, so e.g. a Jupiter/Saturn
  conjunction lights both asymmetrically. Previously only the Moon received
  a colour/strength effect from nearby planets. The Sun donates no colour but
  amplifies whatever's near it (saturation, aura growth, and a "corona floor"
  for close Sun-Moon conjunctions that would otherwise be swallowed by new-moon
  phase scaling). A conjunct body's colour shows in the aura around a planet,
  never on the planet's own body/shell, which always keeps its own colour.
  New `src/lib/astrology.ts` (pure, unit-tested maths).
- `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_NUMBER`, derived from `git
  describe`/`git rev-list --count` in CI and shown on the settings page —
  "which build are you on" is the first question in any store support
  ticket.
- Every request now sends `X-Protocol-Version` (REST) or
  `auth.protocol_version` (Socket.IO connect), so wom-be can recognize and
  reject a client it no longer supports instead of failing some other way.
- Steam release: an Electron shell wraps the same static web build, shipped
  to Steam via the SteamPipe upload pipeline (`npm run steam:upload`). First
  live build went up 2026-09-08.
- Capacitor iOS shell + macOS CI (wom-fe#369): a native iOS project wraps the
  same static build, signed via `fastlane match` and shipped to TestFlight.
  Portrait orientation is now supported alongside landscape (wom-fe#405), and
  the App Store export-compliance question is answered permanently via
  `Info.plist` (wom-fe#404).
- Athens city scene: a real sky over a fixed Athens location, a compass and
  gaze labels on the world map, and background music with mute toggles.
  Ranked and the Bossfight both moved off the old globe screens and into the
  city, staged inside a domed Senate/arena built to hold a live match, with
  a proper spectator ring and a live headcount.
- The Market: a `/market` page and city signpost arm for player trading,
  with a trade-history/chat view and a craft picker.
- Artifacts: a cosmetic Artifacts inventory tab, and a Vault ledger tracking
  where every copy descended from.
- The Merchant encounter and the Stone of Vitality relic, appearing around
  conjunctions and the full moon.
- Timewarp: a live, server-pushed globe-wide event tied to conjunctions and
  the full moon, with its own clock and preview, and an animated return to
  "now" (draining the clock over the hour) once it ends.
- Paper → Artifact ("Transcribe"): trade a Paper for an Artifact at the
  Merchant, with the Vault ledger tracking transcription lineage.
- My AI: a page to toggle, tune, and watch your bot-ranked AI train.
- A Privacy Policy page.

### Changed
- `PROTOCOL_VERSION` is now 3. Installed builds from before this release get
  "Update World of Mythos to play ranked." Everything else keeps working
  for them.
- Lobby URLs moved from `/lobby/<id>` to `/lobby?id=<id>` (the dynamic path
  segment couldn't be statically exported — `docs/MOBILE_AND_STEAM_PLAN.md`
  §5.3). Old-shape links (already shared via copy-link/QR) keep working —
  `/lobby/<id>` now redirects to the new shape rather than 404ing.
- `next.config.ts`'s build output is conditional on `BUILD_TARGET=native`:
  `output: "export"` (a native shell's static bundle) vs. today's
  `"standalone"` (the web deploy, unaffected either way).

### Fixed
- Ranked no longer loses a match just because a player's socket dropped.
- Assorted bossfight visual bugs from this period: HP/attack/Well buttons
  getting stuck oversized, clipped hit numbers, a name tag overlapping on
  doubled bosses, and an `Html` scale-stuck bug on real mobile viewports.

## [0.1.0] - 2026-08-12

Starting tag for semantic versioning (`docs/MOBILE_AND_STEAM_PLAN.md` §4.1).
Everything before this point is undifferentiated history.
