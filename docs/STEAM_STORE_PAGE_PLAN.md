# Steam Store Page & Key Art Plan

Status: **draft · nothing started · no Steamworks account yet** ·
Scope: `wom-fe` (art, copy, captures) · Last updated: 2026-09-01

Expands `MOBILE_AND_STEAM_PLAN.md` §10 (Phase 6 — Steam), which scopes the
*shell* and the *logistics* but treats the store page as one line: "Store page
assets: capsule art in several sizes, trailer, description. This is real design
work, not a checkbox." This document is that checkbox opened up.

All dimensions below were verified against Valve's live documentation on
2026-09-01, not recalled — Valve doubled the capsule sizes some years ago and
the old numbers are still all over the internet.

---

## 1. The one scheduling fact

The store page is **not** gated on the Electron shell. Capsules, screenshots,
trailer and copy can all be produced from the web build that runs today, because
the Steam build is the same renderer in a wrapper (`MOBILE_AND_STEAM_PLAN.md`
§1). That matters because of three clocks that run on Valve's calendar, not on
development time:

| Clock | Length | Starts when |
|---|---|---|
| Steam Direct waiting period | **30 days** | The $100 app fee is paid |
| Store page must sit as "Coming Soon" | **≥ 2 weeks** | The page is approved and set live |
| Store page review, per submission | 3–5 business days (submit **7 days** early) | Each submission |

These overlap rather than stack, so the realistic floor from "paid the fee" to
"allowed to press release" is **~30 days**, and only if the page clears review
first time. It is not additive with the shell work — it runs alongside it.

The build must also be reviewed before release, and *that* does need the Electron
shell to exist. So the honest sequencing is: **store page work can start now and
should, the release cannot happen until the shell lands** (`MOBILE_AND_STEAM_PLAN.md`
§15 lists Electron shell / SteamPipe / Steam Direct all as Not started).

---

## 2. 🔴 The sequencing trap: screenshots vs. the art pass

This is the one thing in this document that can waste real work.

Valve requires screenshots to be **actual gameplay** — no concept art, no
pre-rendered stills — and they are the single most load-bearing asset on the
page. But `ART_STYLE_PLAN.md` is a pending, whole-game restyle: the wheel has no
art at all, rank badges are text chips, every modal and HUD icon is still an
emoji glyph, and §6 flags the world-map planet textures as the recognizable free
three.js texture set.

Screenshots shot today would show the pre-restyle game, and would have to be
reshot after the pass. Worse, capsule art drawn to match today's look would be
drawn to a style that is being deliberately replaced.

**Therefore: §4 of `ART_STYLE_PLAN.md` (modal frame + core icons) and the HUD
work should land before store screenshots are shot.** The store page cannot be
finished ahead of the art pass — only started.

Two further couplings to the art plan:

- 🔴 **Hades must not appear in any store asset until v4 exists.**
  `ART_STYLE_PLAN.md` §3 flags the current `hades_v3-ld.glb` as too close to
  Disney's portrayal. That is a tolerable-but-real risk on a personal site; on a
  Steam capsule or a trailer thumbnail — a commercial, permanently archived,
  scraped-by-everyone surface — it is a materially worse exposure, and the boss
  is exactly the thing key art wants to feature. Draw the capsule around
  something else, or do Hades v4 first.
- **The extreme asset tier is the Steam tier** (`MOBILE_AND_STEAM_PLAN.md` §6.4),
  and the prettiest captures would come from it. But the tier resolver is Not
  started and the 10k earth maps do not exist yet (§15). Captures today would be
  from the low tier — i.e. not the version Steam players will see.

---

## 3. Decisions to make before drawing anything

None of these are art questions, but every one of them changes the art or the
copy. They are cheap to answer now and expensive to answer after the page is
drawn.

| # | Decision | Notes |
|---|---|---|
| 1 | **Premium or free-to-play** | `MOBILE_AND_STEAM_PLAN.md` §10.3 recommends premium with `SHOP_ENABLED` off for Steam. This changes the store page type, whether a price is set, and whether the loot-box/odds disclosure applies on this platform at all. Decide first — it is the root of the others. |
| 2 | **Price and currency** | Only if premium. Valve applies its own regional pricing matrix from the USD anchor. |
| 3 | **The tagline** | `src/app/layout.tsx:19` currently has `description: "World of Mythos"` — the game has no positioning sentence anywhere in the codebase. The store page cannot be written without one, and the short description is the most-read text on Steam. |
| 4 | **Genre + tags** | Valve allows up to 20 tags; the first few drive discovery queues far more than the rest. |
| 5 | **Early Access or 1.0** | An online-only game with a solo dev and a pending art pass is a textbook Early Access case. It also lowers the bar the screenshots have to clear. |
| 6 | **Norwegian ENK tax position** | Valve becomes merchant of record, which is a different VAT position from selling via Stripe (`MOBILE_AND_STEAM_PLAN.md` §10.2, `MONETIZATION_PLAN.md` §6.6). Worth checking before the tax interview, not after. |

---

## 4. The asset spec

Verified against Valve's docs, 2026-09-01. "Auto" means Valve generates the
smaller variant itself — do not draw it.

### 4.1 Store capsules (required)

| Asset | Size | Format | Notes |
|---|---|---|---|
| Small capsule | 462 × 174 | PNG | Logo should **nearly fill** it. Auto-generates 184×69 and 120×45 — it must survive being read at 120px wide. This is the hardest one and the one most often botched. |
| Header capsule | 920 × 430 | JPG | The default face of the game across the store. |
| Main capsule | 1232 × 706 | JPG | Front-page features, sales, and the top of the store page carousel. |
| Vertical capsule | 748 × 896 | JPG | Used in seasonal-sale and some discovery layouts. |
| Page background | 1438 × 810 | — | Optional; auto-derived from a screenshot if omitted. Should be ambient and must not compete with page content. |

### 4.2 Library assets (required — these are what an owner sees, forever)

| Asset | Size | Format | Notes |
|---|---|---|---|
| Library capsule | 600 × 900 | PNG | Auto-generates 300×450. Key art + logo. |
| Library header | 920 × 430 | PNG | Branding-focused. |
| Library hero | 3840 × 1240 | PNG | Auto-generates 1920×620. **No text permitted.** Safe area is the centre **860 × 380** — anything outside it can be cropped away. |
| Library logo | 1280 wide and/or 720 tall | PNG, **transparent** | Logotype (+ optional logomark) only. Placement over the hero is chosen in Valve's preview tool: left-bottom, centred-top, centred-middle, centred-bottom. |

### 4.3 Rules that apply to all capsule art

- The **logo must be clearly legible** at every size.
- **No marketing copy beyond the game title** — no review quotes, no scores, no
  "award-winning", no feature bullets baked into the image. Valve rejects for this.
- Art should be graphically-centric and convey the experience, not be a
  screenshot with a logo pasted on.
- Capsules should feel like one family. The small capsule is allowed to differ
  in composition (it has to, at that aspect ratio) but not in identity.

### 4.4 Screenshots and trailer

| Asset | Spec | Notes |
|---|---|---|
| Screenshots | ≥ 1920 × 1080, 16:9, **minimum 5** | Actual gameplay only. At least 4 must be marked suitable for all ages. No overlaid marketing text or awards. |
| Trailer | 1920 × 1080 | Gameplay in the first few seconds. Steam autoplays it muted at the top of the page — it must read with no sound. |

For WoM specifically, the screenshots write themselves once the art pass lands:
the lobby battle around the table, the bossfight, the world map with the
planetary aspects lit, the vault, the inventory grid of frog skins. That is five
without straining, and they are all capturable from the browser at 1920×1080 —
no shell required.

### 4.5 Other

| Asset | Size | Format | Notes |
|---|---|---|---|
| App icon | 184 × 184 | JPG | The game's icon across the Steam client and community. |
| Shortcut icon | 256 × 256 | ICO or PNG | Used for the desktop shortcut Steam creates on install. |
| Event cover | 800 × 450 | — | Only if Steam events/announcements are used later (patch notes, sales). |
| Event header | 1920 × 622 | — | Optional, same. |

---

## 5. What to draw, given the existing style

`ART_STYLE_PLAN.md` locks the identity: hand-drawn, homemade, anchored on the
rope frame (`public/models/buttons/rope_button-ld-v2.png`) and parchment
(`public/images/parchment.png`), and it states the rule plainly — *all art is
drawn by hand (no generated/stock assets), uniqueness is the point.*

That rule was written about in-game art. **Whether it extends to store key art is
an open decision and should be made explicitly**, because key art is a different
job from UI art: it is one large illustration, seen once, at high resolution,
competing against professionally-illustrated capsules in the same row. It is also
the single highest-leverage image the game will ever have.

Two coherent positions:

1. **Extend the rule.** Hand-draw the key art too. The homemade rope/parchment
   look becomes the pitch — it reads as authored, and on a store page full of
   competent generic 3D that is a genuine differentiator, not a compromise.
2. **Commission the key art only.** Keep every in-game pixel hand-drawn, but treat
   the capsule as marketing rather than game art and pay an illustrator for the
   one image that has to out-punch everything next to it. Roughly $200–800 for a
   capsule set from a freelance illustrator.

There is a third option — generate it — which is worth naming only to note that
it conflicts directly with the locked "no generated assets, uniqueness is the
point" decision, and that Valve requires disclosure of AI-generated content in
the store page's AI disclosure field. Given the whole art plan is built on
uniqueness, generated key art would undercut the thing it is meant to sell.

A pragmatic split: **one drawn illustration** composed once, then cropped and
re-laid-out for all six capsule aspect ratios. Draw it wide and generously
overscanned so the 748×896 vertical and the 462×174 small capsule can both be
pulled from it, and draw the logo as a separate transparent layer — the library
logo has to ship transparent anyway (§4.2), so building it separately is free.

**The logo is the prerequisite for all of it.** `ART_STYLE_PLAN.md` §6.4 flags
`public/wom.svg` / `src/app/icon.svg` as needing confirmation that they are even
original, and every single capsule requires a legible logo. The wordmark is the
first thing to settle.

---

## 6. Store page copy — first draft

Not final, and deliberately written to be argued with. The voice should be the
game's, and the game does not have a stated voice yet (§3, decision 3).

**Short description** (Valve shows ~300 chars, and it is the most-read text on
the page):

> A turn-based multiplayer duel in a hand-drawn mythological world. Read your
> opponent, commit to an action, and live with it. Fight other players for the
> crown, or band together against Hades in the underworld.

**About This Game** (draft skeleton):

- **Every round is a read.** Both players commit an action and a resource at the
  same time, and the combat engine resolves what happens between them. There is
  no initiative to win and no stat check to hide behind — you are guessing what
  the other player is about to do, and they are guessing about you.
- **Take the crown, or take the boss.** PvP lobbies run until one player is left
  standing. Bossfight lobbies put everyone on the same side against Hades, and
  everyone who survives walks away with a relic.
- **A sky that is actually the sky.** The world map is driven by real planetary
  positions — conjunctions light the planets in each other's colours as they
  actually happen overhead.
- **Drawn by hand.** Every frame of it.
- **Bring people, or find them.** Share a lobby link, or fill the seats with bots.

**Required disclosures** (not optional, and Valve enforces them):

- **Online-only.** The game cannot be played without the backend. Valve requires
  disclosing that, and — per `MOBILE_AND_STEAM_PLAN.md` §10.4 — Steam reviews
  punish an undisclosed server dependency brutally the first time the Hetzner box
  hiccups. Say it plainly on the page rather than in the fine print.
- **A third-party account is required.** WoM accounts are separate from Steam
  accounts; Valve has a dedicated field for this and requires it to be filled in.
- **Privacy policy.** Required, and currently 🔴 Not started
  (`LEGAL_COMPLIANCE_PLAN.md` §2.1, `MOBILE_AND_STEAM_PLAN.md` §15 Phase 5).
- **EULA.** Valve's default is offered; a custom one is optional.
- **AI disclosure.** A store-page field. Answerable "no" today, and worth keeping
  answerable "no" (§5).

---

## 7. Ordering

The first three items need no art, no shell, and no decisions from anyone else,
and one of them starts a 30-day clock. They are the whole point of doing this now.

1. **Answer §3.** Premium vs. F2P first; the rest follow from it.
2. **Settle the wordmark** (§5). Everything visual is blocked on it.
3. **Pay Steam Direct, start the 30-day clock, do the tax interview.** $100,
   recoupable. Only worth doing once §3.1 is answered and Steam is actually
   committed to — see the caution below.
4. **Write the privacy policy** (`LEGAL_COMPLIANCE_PLAN.md` §2.1) — blocks the
   store page, and mobile, and is a few hours of work.
5. **Land `ART_STYLE_PLAN.md` §4** (modal frame + core icons + HUD) so the game
   photographs as the game that will ship (§2).
6. **Hades v4** (`ART_STYLE_PLAN.md` §3) — before he appears in any store asset.
7. **Shoot screenshots** at 1920×1080 from the browser.
8. **Draw the key art**, then cut the six capsule sizes from it (§4, §5).
9. **Cut the trailer** — must read muted.
10. **Submit the page for review**, 7 days before it should go live. Set Coming
    Soon, and let the 2-week clock run alongside the Electron shell work
    (`MOBILE_AND_STEAM_PLAN.md` §10.1).

**Caution on step 3:** the fee is per-app and non-refundable (recoupable only
against $1,000 of revenue). The 30-day clock is a strong argument for paying
early, but it is only 30 days — and the art pass, the shell, and the legal pages
in front of it are measured in more than that. Paying on day one buys nothing if
step 5 takes two months. Pay it when the art pass is underway, not before.

---

## 8. Status tracker

| Item | Status |
|---|---|
| Premium vs. F2P decision (§3.1) | Not started |
| Tagline / positioning (§3.3) | Not started — `layout.tsx:19` is a placeholder |
| Wordmark / logo confirmed original (§5) | Not started — `ART_STYLE_PLAN.md` §6.4 |
| Steamworks partner account | Not started |
| Steam Direct fee paid (starts 30-day clock) | Not started |
| Tax interview / ENK position checked | Not started |
| Privacy policy page | 🔴 Not started — `LEGAL_COMPLIANCE_PLAN.md` §2.1 |
| Hades v4 (blocks key art) | Not started — `ART_STYLE_PLAN.md` §3 |
| Art pass §4 landed (blocks screenshots) | Not started |
| Key art illustration | Not started |
| Small capsule 462×174 | Not started |
| Header capsule 920×430 | Not started |
| Main capsule 1232×706 | Not started |
| Vertical capsule 748×896 | Not started |
| Library capsule 600×900 | Not started |
| Library header 920×430 | Not started |
| Library hero 3840×1240 | Not started |
| Library logo (transparent) | Not started |
| 5+ gameplay screenshots @1920×1080 | Not started |
| Trailer | Not started |
| Store copy final | Draft only (§6) |
| Online-only + third-party-account disclosures | Not started |
| Page submitted for review | Not started |
