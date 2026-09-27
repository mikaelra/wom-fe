# Changelog

All notable wire-visible or user-visible changes to this repo. Store listings
require release notes on every submission (`docs/MOBILE_AND_STEAM_PLAN.md`
§4.5), so this starts now rather than being reconstructed later.

Versioning is SemVer against `wom-be/docs/PROTOCOL.md`'s `PROTOCOL_VERSION`
(mirrored here as `src/config.ts`'s `PROTOCOL_VERSION`), not against feature
count.

## [Unreleased]

### Added
- **City scene** (`/city?id=athens`, `docs/CITY_SCENE_PLAN.md`): a city under
  its real sky, with a signpost leading to the boss raid, ranked (Standard vs
  Bot Ranked), and the Market; building signs, the Senate, the Bay, zoom, a
  loading curtain, and city music (#327, #341, #348, #388, #391).
- **Market** (`/market`, `docs/MARKET_PLAN.md`): player-to-player swaps with
  a board, chat, craft offers, trade history and an RMT disclaimer gate
  (#332, #340, #342–#345, #366).
- **Artifacts**: the cosmetic, an Artifacts inventory tab, and the Vault
  reworked into a room holding the public artifact ledger (#330, #364).
- **Trade-ups** in the inventory (#306).
- **My AI** (`/my-ai`): toggle, tune and watch a personal AI that plays bot
  ranked, with its own frog-robot skin (#349, #353, #362).
- **Seasons**: season countdown on the stats and My AI pages, and a seasons
  overlay (Hall of Records) on the stats page (#376, #377).
- **Merchants** (`docs/MERCHANT_PLAN.md`): globe encounters tied to the sky —
  Paper at the full moon, the Stone of Vitality at planetary conjunctions
  (which one sells what is set by wom-be) — with stacked markers, a merchant
  scene, a Timewarp popup that rewinds the sky for everyone, and a world clock
  on the globe and city screens (#381, #392).
- **Privacy Policy** page (#333).
- **Music and sound**: background music with music/SFX toggles and levels,
  resource/pickup/instakill sounds, paused when the tab is backgrounded
  (#321–#325, #338, #378).
- **Steam build**: Electron shell, steamworks.js, per-shell Sentry
  environments, and a SteamPipe upload pipeline (`electron/`, `steam/`;
  #355, #358, #360, #363, #365). Native builds use the highest-tier globe
  and Milky Way textures (#313).
- A dev-only `/modelling` sandbox for iterating on procedural buildings,
  excluded from every build (#336).
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

### Changed
- Lobby URLs moved from `/lobby/<id>` to `/lobby?id=<id>` (the dynamic path
  segment couldn't be statically exported — `docs/MOBILE_AND_STEAM_PLAN.md`
  §5.3). Old-shape links (already shared via copy-link/QR) keep working —
  `/lobby/<id>` now redirects to the new shape rather than 404ing.
- `next.config.ts`'s build output is conditional on `BUILD_TARGET=native`:
  `output: "export"` (a native shell's static bundle) vs. today's
  `"standalone"` (the web deploy, unaffected either way).
- The Vault's passkey prompt is gone; the Vault is now a room showing the
  public artifact ledger (#330).
- Cities are places you travel to from the globe; the old home-page City Hub
  (`HomeOverlay` over a temple scene) was removed (#327).
- Start Game / Add Bot / Lobby ID use the rope-frame button style; the home
  page title and player count were removed (#314).

### Fixed
- Ranked matches no longer lost to a dropped socket (#337); bot-ranked
  "invalid token" race on match-found (#375).
- Boss HP drops only after the attack animations play (#375).
- Orphaned block shields no longer persist across rounds (#304); attack/defend
  previews clear correctly (#320); resource-gain animations don't replay for
  dead players (#356).
- Oversized/stuck `Html` buttons on real mobile viewports (#309, #310); logo
  on phones (#312); QR code clipping on mobile (#318).
- Music autoplay (#322); the Moon drawn as the Moon rather than a second sun
  (#328); globe and city sky follow a time revert (#383).

## [0.1.0] - 2026-08-12

Starting tag for semantic versioning (`docs/MOBILE_AND_STEAM_PLAN.md` §4.1).
Everything before this point is undifferentiated history.
