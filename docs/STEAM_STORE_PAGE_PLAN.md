# Steam Store Page & Key Art Plan

Status: **active · Steam Direct fee paid, 30-day clock running · premium, $2 ·
art direction decided: no custom art, in-game captures only · capture harness
built (`wom-e2e`, branch `capture-harness`)** ·
Scope: `wom-fe` (captures, capsules, copy) · Last updated: 2026-09-01

Expands `MOBILE_AND_STEAM_PLAN.md` §10 (Phase 6 — Steam), which scopes the
*shell* and the *logistics* but treats the store page as one line: "Store page
assets: capsule art in several sizes, trailer, description. This is real design
work, not a checkbox." This document is that checkbox opened up.

All dimensions and requirements below were verified against Valve's live
documentation on 2026-09-01, not recalled — Valve doubled the capsule sizes some
years ago and the old numbers are still all over the internet.

---

## 1. The clocks

The Steam Direct fee is **paid**, so the 30-day waiting period is already
running. That is the good case: it is the one clock that costs nothing to run in
the background, and it is now running for free while the assets get made.

| Clock | Length | State |
|---|---|---|
| Steam Direct waiting period | 30 days | ⏳ **Running** — started on the fee payment date. *Record the exact date here; it sets the earliest possible release day.* |
| Store page as "Coming Soon" | ≥ 2 weeks | Not started — begins when the page is approved and set live |
| Store page review, per submission | 3–5 business days (submit **7 days** early) | Not started |

These overlap rather than stack. The practical reading: **the store page should
be submitted for review within the next two weeks**, so that its 2-week Coming
Soon period finishes at roughly the same time as the 30-day Direct hold, rather
than starting after it.

The build must also be reviewed before release, and *that* needs the Electron
shell, which is Not started (`MOBILE_AND_STEAM_PLAN.md` §15). So the clocks are
no longer the binding constraint — **the shell is**. Getting the page up early is
still right, because it is cheap and it front-loads Valve's review latency, but
it will not be what determines the release date.

---

## 2. The art decision, and what it costs

**Decided: no custom art for this pass. Store assets are built from in-game
captures of the game as it stands today.**

That is a defensible call — it gets a page live while the clocks run, and Steam
store assets can be replaced at any time after publish, with no re-review of the
page as a whole. This is explicitly a first pass, not the final storefront.

What it costs, stated plainly so it is a known trade and not a surprise:

- **Screenshots will show the pre-restyle game.** `ART_STYLE_PLAN.md` is a
  pending whole-game restyle — the wheel has no art at all, rank badges are text
  chips, and every modal and HUD icon is still an emoji glyph. All of that will
  be visible in the captures. Plan to reshoot after the art pass lands.
- **The HD assets cannot be shown.** The 470 MB high/extreme tier exists on disk
  but only one asset in the tree actually branches on quality
  (`MOBILE_AND_STEAM_PLAN.md` §3, §6). Captures will show the low tier — i.e. not
  what Steam players will eventually get. Nothing to do about it now; it lands
  with §6 of that plan.
- **Capsules still have to be made.** "No custom art" does not mean "no
  capsules" — all six are *required* to publish (§4). They will be composited
  from captures plus the wordmark rather than illustrated (§5).
- **A trailer is required.** Valve: *"you will be required to upload a trailer
  for your product."* It is not optional and cannot be deferred past release.
  With no custom art it is a gameplay capture cut, which is also what Valve
  recommends anyway (§4.4).

### 2.1 🔴 Hades must stay off the store page

This is the one consequence of "screenshots as-is" that needs an active decision
rather than acceptance.

`ART_STYLE_PLAN.md` §3 flags the live boss model (`hades_v3-ld.glb`) as too close
to Disney's portrayal — the blue-flame-hair / grey-skin / dark-robe combination is
the recognizable part. The bossfight is a headline feature, so it is exactly what
a screenshot set would want to show.

A personal site and a commercial storefront are not the same exposure. The Steam
page is permanently archived, scraped, mirrored to dozens of aggregator sites,
and is the surface a rights-holder complaint would actually attach to.

**Recommendation: shoot the PvP and world-map scenes, and keep Hades out of the
captures entirely for this pass.** The bossfight can be *described* in the copy
(§6) without being pictured. There are more than five good scenes without him
(§4.4), so this costs nothing. Revisit once Hades v4 exists.

Secondary, much lower risk, worth knowing: the world-map planet textures are the
widely-used free three.js texture set (`ART_STYLE_PLAN.md` §6.1). On a store page
they are recognizable as stock. Not a legal problem — a distinctiveness one.

---

## 3. Decisions still open

The art-direction question is closed. These are not, and two of them block the
page's text rather than its images.

| # | Decision | Notes |
|---|---|---|
| 1 | ✅ **Premium** | Decided. Matches `MOBILE_AND_STEAM_PLAN.md` §10.3's recommendation: sell the game outright with `SHOP_ENABLED` off for Steam, which also keeps the loot-box/odds disclosure off this platform entirely (§6). |
| 2 | ✅ **$2 USD** | Decided; Valve derives regional pricing from this anchor. Two consequences worth having in view rather than discovering later: Valve's cut is 30%, so this nets roughly $1.40 a copy; and the $100 Direct fee is recoupable only once the app reaches $1,000 **Adjusted Gross Revenue**, which at $2 is about 500 copies. Neither changes the decision — a low, honest price for a small multiplayer game is coherent — but it does mean the fee should be treated as spent, not as an advance. |
| 3 | ✅ **Tagline drafted** | Options and a recommendation in §3a; the recommended line is now live in `src/app/layout.tsx` (it replaced the `description: "World of Mythos"` placeholder, which was worthless as SEO regardless of what we pick). One string to swap if you want a different one. |
| 4 | **Genre + tags** | Up to 20; the first few drive the discovery queues far more than the rest. Shortlist drafted in §3b — still needs picking against Steam's actual tag list, which is fixed and not free text. |
| 5 | **Early Access or 1.0** | An online-only game, solo dev, pending art pass — a textbook Early Access case, and it lowers the bar the screenshots have to clear, which matters more than usual given §2. |
| 6 | **Norwegian ENK tax position** | Valve becomes merchant of record — a different VAT position from selling via Stripe (`MOBILE_AND_STEAM_PLAN.md` §10.2, `MONETIZATION_PLAN.md` §6.6). The tax interview is part of onboarding; worth checking before completing it. |

### 3a. Tagline options

The game's hook is the simultaneous commit: both players choose at the same time,
so you are reading a person, not a stat block. Every option below leads with that
rather than with the setting, because "mythology game" is a crowded shelf and
"you are guessing what they will do" is not.

| # | Line | Reads as |
|---|---|---|
| 1 ⭐ | **Read your opponent. Commit. Live with it.** | The mechanic as a rhythm. Short enough for a capsule, and the third beat is what makes it a game rather than a menu. |
| 2 | **Both players choose at once. One of you is wrong.** | Sharper, more combative. Better for a trailer end-card than for a store header. |
| 3 | **A duel is a conversation you both speak at the same time.** | The most distinctive, the least scannable. Good "About This Game" opener, weak capsule line. |
| 4 | **Turn-based duels where the turn happens to you both.** | Most descriptive of the genre for someone filtering; the least memorable. |

**Recommendation: #1.** It survives being set small on a capsule, it says what the
game asks of you, and it does not promise production value the screenshots will not
back up — which matters given §2's decision to ship un-restyled captures.

Live meta description (`src/app/layout.tsx`), deliberately without a price so it
does not collide with the $2 Steam anchor while the browser build stays free:

> A turn-based multiplayer duel in a hand-drawn mythological world. Both players
> commit at once — read your opponent, or be read.

### 3b. Genre and tag shortlist

Steam's tags are a fixed vocabulary picked in the Steamworks tag picker, not free
text, so treat the names below as intent to be matched rather than as final
strings. Order matters: the first handful feed the discovery queues.

**Genre:** Strategy (primary), Indie, Casual.

**Tags, ranked:** Multiplayer · PvP · Turn-Based Combat · Online Co-Op · Mythology ·
Competitive · Strategy · Indie · Fantasy · 3D · Casual · Singleplayer (bots fill
empty seats, so this is honest — but rank it low, it is not what the game is for).

Two to be careful with: do **not** tag Free to Play (§3 decision 1 is premium), and
do not tag Early Access as a tag — it is a separate store setting (§3 decision 5).

---

## 4. The asset spec

Verified against Valve's docs, 2026-09-01. "Auto" means Valve generates the
smaller variant itself — do not make it.

### 4.1 Store capsules (all required)

| Asset | Size | Format | Notes |
|---|---|---|---|
| Small capsule | 462 × 174 | PNG | Logo should **nearly fill** it. Auto-generates 184×69 and 120×45 — it must survive being read at 120px wide. The hardest one, and the one most often botched. |
| Header capsule | 920 × 430 | JPG | The default face of the game across the store. |
| Main capsule | 1232 × 706 | JPG | Front-page features, sales, top of the store page. |
| Vertical capsule | 748 × 896 | JPG | Seasonal-sale and some discovery layouts. |
| Page background | 1438 × 810 | — | Optional; auto-derived from a screenshot if omitted. **Leave it to Valve this pass** — it should be ambient and not compete with page content, which is exactly what an auto-derived one does. |

### 4.2 Library assets (required — this is what an owner sees, forever)

| Asset | Size | Format | Notes |
|---|---|---|---|
| Library capsule | 600 × 900 | PNG | Auto-generates 300×450. |
| Library header | 920 × 430 | PNG | Branding-focused. |
| Library hero | 3840 × 1240 | PNG | Auto-generates 1920×620. **No text permitted.** Safe area is the centre **860 × 380** — anything outside it can be cropped. |
| Library logo | 1280 wide and/or 720 tall | PNG, **transparent** | Logotype (+ optional logomark) only. Placement over the hero is chosen in Valve's preview tool. |

### 4.3 Rules that apply to every capsule

- The **logo must be clearly legible** at every size.
- **No marketing copy beyond the game title** — no review quotes, no scores, no
  "award-winning", no feature bullets baked into the image. Valve rejects for this.
- Art should be graphically-centric and convey the experience, not read as a
  screenshot with a logo pasted on. See §5 for how to satisfy this without an
  illustrator.
- The capsules should feel like one family. The small capsule is allowed to
  differ in composition — it has to, at that aspect ratio — but not in identity.

### 4.4 Screenshots and trailer

| Asset | Spec | Notes |
|---|---|---|
| Screenshots | ≥ 1920 × 1080, 16:9, **minimum 5** | Actual gameplay only — no concept art or pre-rendered stills. At least 4 marked suitable for all ages. No overlaid marketing text or awards. |
| Trailer | ≤ 1920 × 1080, 30/60 fps, 5,000+ Kbps, .mp4 (H.264 / AAC) | **Required.** Gameplay-first; Valve notes viewers may give it under 10 seconds and often watch muted, so it must read with no sound. |

Candidate scenes, all capturable from the browser today and all Hades-free (§2.1):

1. The lobby battle around the table, mid-round, both players committed.
2. The world map with planetary aspects lit.
3. The moment of a resolved hit — the floating combat numbers landing.
4. The vault scene.
5. The inventory grid of frog skins.
6. A full lobby with several players and the crown marker visible.

### 4.5 Other

| Asset | Size | Format | Notes |
|---|---|---|---|
| App icon | 184 × 184 | JPG | The game's icon across the Steam client and community. |
| Shortcut icon | 256 × 256 | ICO or PNG | Desktop shortcut Steam creates on install. |
| Event cover | 800 × 450 | — | Only if Steam events/announcements are used later. |
| Event header | 1920 × 622 | — | Optional, same. |

---

## 5. Building the capsules without custom art

The constraint is real but not unusual — a large share of indie capsules are
composited from in-game renders. The trick is to stop thinking of it as
"screenshot with a logo on it" and treat the 3D scenes as a render source.

### 5.1 🔴 The wordmark is now the critical path

Every one of the six required capsules needs a legible logo, and the library logo
must ship as transparent PNG. With illustration off the table, **the wordmark is
the only piece of custom art the page cannot avoid.**

`ART_STYLE_PLAN.md` §6.4 flags `public/wom.svg` and `src/app/icon.svg` as needing
confirmation that they are even original. That confirmation is now blocking, not
housekeeping. If the current mark is original and usable, everything else is
compositing. If it is not, a wordmark is the one thing to commission or draw.

**Inspected 2026-09-02. The finding is worse than "unconfirmed": there is no
wordmark in the repo at all.**

`public/wom.svg` and `src/app/icon.svg` are byte-identical — one file, referenced
twice. It is a 512×512 circular emblem: 12 paths, four flat fills, a circular
clip, and **zero `<text>`, `<tspan>`, or `font-family` elements**. It contains no
lettering of any kind.

That matters because a capsule is not an icon. Valve's capsule guidance requires
the game's *title* legible at small sizes, and the library logo asset is
specifically the game's name as transparent art. So the icon does not satisfy the
capsule requirement even if its provenance turns out to be spotless — **the words
"World of Mythos" still have to be set as type, and that work has not started.**
The good news is that this is the cheapest kind of custom art there is: type
selection and spacing, not illustration.

**Provenance is still open, and there are two flags.** Git history is
`5665762 "added svg of icon"` (18 Mar 2026, a single file, no source art, no
license note) then `676fd48 "recolor icon"` 22 minutes later. There is no `.ai`,
`.fig`, `.afdesign`, `.sketch`, or `.psd` anywhere in the repo, so nothing records
where it came from. Two things are worth a straight answer before it ships on a
commercial storefront:

1. **The SVG has a converter fingerprint, not an editor one.** Random 10-hex-digit
   `clipPath` ids, an explicit `zoomAndPan="magnify"`, `version="1.0"`, an empty
   `<defs><g/>` — and critically, *no* `inkscape:`/`sodipodi:` namespace, no
   Illustrator generator comment, no Figma metadata. Files drawn by hand in an
   editor almost always carry that editor's traces. This one carries none.
2. **The original fills were `#ff3131` and `#1800ad`.** `#ff3131` is a stock Canva
   swatch. If the mark came out of Canva's element library, that is a licensing
   problem specifically here: Canva's Content License permits using elements in
   designs but **prohibits using them in a logo or trademark**, which is exactly
   what a Steam app icon and library logo are.

Neither is proof — the repo cannot answer where the file came from, only Mikael
can. But "drew it myself from scratch" and "picked it in Canva and recoloured it"
lead to opposite decisions, and the second one needs the icon replaced, not just
the wordmark added.

### 5.2 Capture at native resolution, do not upscale

The game is a real-time three.js renderer, which means it can render at any
resolution — there is no need to upscale a 1080p screenshot to fill a 3840 × 1240
library hero. Render it at 3840 directly and it is genuinely sharp.

**This is built** — `wom-e2e`, branch `capture-harness`, `npm run capture`
(see that repo's `capture/README.md`). `wom-e2e` already had Playwright wired
against a configurable `baseURL`, which made this automatable rather than
manual:

- Playwright's `deviceScaleFactor` and an explicit `viewport` give exact output
  dimensions — set `viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2`
  for a 3840 × 2160 frame to crop the hero from.
- Deterministic captures mean the whole set can be regenerated after the art pass
  with one command, instead of being re-shot by hand — which matters, because §2
  guarantees a reshoot.
- A capture spec can drive the game into a specific state (lobby joined, round
  committed, aspects visible) rather than hoping to catch the moment live.
- The sky can be **pinned**. `/city?id=3&t=19:30` fixes the scene's instant
  (`src/lib/cityTime.ts`), so a capture run is reproducible instead of yielding
  a sunlit shot one day and a black one the next. Without this the store
  screenshots are hostage to whatever is genuinely overhead when they are taken.

Six scenes are wired, all Hades-free per §2.1: the world map, Athens at dusk,
the vault, a lobby pre-game, a started round, and the moment after a round
resolves.

#### 🔴 The captures cannot be produced on the dev VM

Found by building it, not by reasoning about it. The dev box has 2 vCPUs and no
GPU, so Chromium falls back to SwiftShader, and SwiftShader is granted a WebGL
context for these scenes, **loses it**, and is then blocked by Chromium from
getting another. three.js renders nothing.

The dangerous part is that Playwright still writes a perfectly valid PNG — it is
just blank. A blank capsule source is worse than a failed run, because it looks
like output and can reach a store page unnoticed. The harness therefore checks
for context loss and refuses to write the file; on the dev VM all six scenes
fail that check and produce zero files, which is the correct outcome.

Two further traps, both already handled in the harness but worth knowing if it
is ever reconfigured:

- Playwright's *default* headless browser is `chromium_headless_shell`, which
  ships with no GPU stack at all — WebGL is unavailable there regardless of the
  host machine. The full `chromium` channel is required.
- Modern Chromium will not fall back to software WebGL without an explicit flag.
  It is opt-in in the harness, because allowing the fallback lets a weak machine
  try and fail slowly rather than fail immediately.

**Practical consequence: the store captures have to be taken on a machine that
can actually play the game** — any ordinary desktop with hardware acceleration.
This is not a blocker, but it is a step that has to happen somewhere other than
the usual dev/CI box, and it is worth knowing before the day the assets are due.

### 5.3 Per-capsule approach

| Capsule | Approach |
|---|---|
| Small 462 × 174 | **Wordmark only**, on a flat or simple gradient ground. Valve's own guidance is that the logo should nearly fill it, and at the 120 × 45 auto-variant any scene content is mush. Not using a screenshot here is the correct answer, not a compromise. |
| Header 920 × 430 | Wide scene crop (the lobby table reads best at this ratio) with the wordmark to one side. Keep the mark clear of scene clutter. |
| Main 1232 × 706 | The strongest single scene, most generous crop. This is the one people actually look at. |
| Vertical 748 × 896 | Portrait is the awkward ratio for a landscape 3D game. A tight crop on a single character/frog with the world behind, wordmark at the bottom, works better than squeezing a wide scene. |
| Library capsule 600 × 900 | Same portrait treatment as the vertical; they can share a source render. |
| Library header 920 × 430 | Can reuse the store header. |
| Library hero 3840 × 1240 | Ambient wide render, **no text at all**, key content inside the centre 860 × 380. A world-map or sea-and-sky render suits this better than a HUD-heavy scene. |
| Library logo | Transparent wordmark export. Falls out of §5.1 for free. |

### 5.4 Hide the HUD

The single highest-leverage thing available without an illustrator: capture the
3D scenes **with the DOM overlay hidden**. `SceneOverlay.tsx`, `LobbyOverlay.tsx`
and the HUD cards are React components layered over the canvas — suppressing them
for a capture yields a clean render of the actual 3D world, which composites into
a capsule far better than a UI-covered screenshot, and neatly sidesteps the fact
that the HUD is the least-finished part of the art (§2).

Screenshots proper should still show the HUD — Valve wants real gameplay there.
This applies to capsules only.

---

## 6. Store page copy — first draft

Not final, and deliberately written to be argued with. The voice should be the
game's, and the game does not have a stated voice yet (§3, decision 3).

**Short description** (~300 chars, the most-read text on the page):

> A turn-based multiplayer duel in a hand-drawn mythological world. Read your
> opponent, commit to an action, and live with it. Fight other players for the
> crown, or band together against the underworld.

**About This Game** (draft skeleton):

- **Every round is a read.** Both players commit an action and a resource at the
  same time, and the combat engine resolves what happens between them. There is
  no initiative to win and no stat check to hide behind — you are guessing what
  the other player is about to do, and they are guessing about you.
- **Take the crown, or take the boss.** PvP lobbies run until one player is left
  standing. Bossfight lobbies put everyone on the same side, and everyone who
  survives walks away with a relic.
- **A sky that is actually the sky.** The world map is driven by real planetary
  positions — conjunctions light the planets in each other's colours as they
  actually happen overhead.
- **Bring people, or find them.** Share a lobby link, or fill the seats with bots.

**Required disclosures** (Valve enforces these):

- **Online-only.** The game cannot be played without the backend. Valve requires
  disclosing it, and per `MOBILE_AND_STEAM_PLAN.md` §10.4, Steam reviews punish an
  undisclosed server dependency brutally the first time the box hiccups. Say it
  plainly on the page, not in the fine print.
- **A third-party account is required.** WoM accounts are separate from Steam
  accounts; Valve has a dedicated field for this.
- **Privacy policy.** Required. ✅ Live at `/privacy` — the URL to give Valve is
  `https://worldofmythos.net/privacy`. One caveat before it is submitted: the
  controller's registered legal identity is still unset (`LEGAL_ENTITY_NAME` /
  `LEGAL_ENTITY_ADDRESS`, see `LEGAL_COMPLIANCE_PLAN.md` §2.1).
- **EULA.** Valve's default is offered; custom is optional.
- **AI disclosure.** A store-page field. Answerable "no" — and with §2's decision
  to use in-game captures only, it stays answerable "no".

---

## 7. Ordering

The clock is running, so the ordering is now "what gets the page submitted
soonest", not "what is most polished".

1. **Make the wordmark** (§5.1) — blocks all six capsules. Highest priority, and
   now known to be *creation* work rather than a confirmation: the repo has no
   wordmark, only a circular icon. Answer the icon's provenance question in the
   same pass, since a Canva-sourced mark would need replacing too.
2. ~~**Answer §3.1 (premium vs F2P) and §3.3 (tagline)**~~ — ✅ both decided;
   tagline drafted in §3a and live in `layout.tsx`, tags shortlisted in §3b.
3. ~~**Write the privacy policy**~~ — ✅ done, live at `/privacy`, merged to
   master. Set the two legal-entity env vars before submitting
   (`LEGAL_COMPLIANCE_PLAN.md` §2.1).
4. ~~**Build the capture harness** (§5.2) in `wom-e2e`~~ — ✅ done, branch
   `capture-harness`.
5. **Capture screenshots** (5+, HUD visible, no Hades) and **capsule source
   renders** (HUD hidden, high resolution).
6. **Composite the six capsules** (§5.3).
7. **Cut the trailer** from captured gameplay — required, gameplay-first, must
   read muted.
8. **Complete the tax interview** (§3.6) if not already done as part of onboarding.
9. **Submit the page for review**, allowing 7 days. Set Coming Soon and let the
   2-week clock run alongside the Electron shell work.
10. **After the art pass lands:** re-run the capture harness, replace screenshots
    and capsules, add Hades once v4 exists.

---

## 8. Status tracker

| Item | Status |
|---|---|
| Steam Direct fee paid (30-day clock) | ✅ **Paid — clock running** (record exact date, §1) |
| Steamworks partner account | Assumed done with the fee — confirm |
| Price set ($2 USD anchor) | ✅ Decided — not yet entered in Steamworks |
| Tax interview / ENK position checked | Not started |
| Art direction for store assets | ✅ **Decided — in-game captures, no custom art** |
| Wordmark confirmed original + usable | 🔴 **No wordmark exists** — `wom.svg` is a lettering-free icon; must be created (§5.1) |
| Premium vs. F2P decision (§3.1) | ✅ **Premium** |
| Tagline / positioning | ✅ **Drafted (§3a) and live in `layout.tsx`** — swap the string if you prefer another |
| Privacy policy page | ✅ **Live at `/privacy`, merged** — legal-entity env vars still unset (§2.1) |
| Capture harness in `wom-e2e` (§5.2) | ✅ Built — branch `capture-harness`, `npm run capture` |
| 5+ gameplay screenshots @1920×1080, Hades-free | Not started — **needs a GPU machine** (§5.2) |
| Capsule source renders (HUD hidden) | Not started — **needs a GPU machine** (§5.2) |
| Small capsule 462×174 | Not started |
| Header capsule 920×430 | Not started |
| Main capsule 1232×706 | Not started |
| Vertical capsule 748×896 | Not started |
| Library capsule 600×900 | Not started |
| Library header 920×430 | Not started |
| Library hero 3840×1240 | Not started |
| Library logo (transparent) | Not started |
| App icon 184×184 | Not started |
| Icon provenance answered (Canva-license risk, §5.1) | 🔴 Open — needs Mikael |
| Trailer (required) | Not started |
| Store copy final | Draft (§6) + tagline (§3a) + tag shortlist (§3b) |
| Online-only + third-party-account disclosures | Drafted in §6 — privacy policy URL now available |
| Page submitted for review | Not started |
| Electron shell (blocks release, not the page) | Not started — `MOBILE_AND_STEAM_PLAN.md` §15 |
