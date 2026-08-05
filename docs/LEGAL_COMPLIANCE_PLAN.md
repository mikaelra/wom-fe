# Legal & Regulatory Compliance Plan

Status: draft, nothing implemented yet · Scope: `game/frontend` + `game/backend` · Last updated: 2026-08-05

**This is not legal advice.** It's a working checklist compiled from a review of the
actual stack (what data we collect, which third parties process it, what we sell and
how) so a lawyer has a concrete starting point rather than a blank page. The two items
flagged 🔴 below are genuinely unsettled/jurisdiction-dependent and should get an
actual legal opinion before a wider launch, not just a policy page.

## 1. Current data footprint (context for everything below)

- Postgres on our self-hosted Hetzner VM (EU/Germany — favorable for GDPR data
  residency, though residency alone doesn't equal compliance).
- **Stripe** for payments, via Stripe Checkout (hosted page — we never touch card
  data directly, which keeps PCI-DSS scope to the simplest self-assessment tier,
  SAQ A).
- **Resend** for transactional email (verification codes/links).
- **Sentry** for error tracking (can capture IPs/user context in error payloads if
  not configured carefully).
- Data stored: player emails, session tokens, chat messages, gameplay/round history,
  order/payment metadata.
- No client-side analytics or tracking scripts (Google Analytics, PostHog, etc.) are
  in the codebase today — this means no cookie-consent banner is currently required.
  Adding any tracking script later reopens that requirement.
- Existing legal pages: `src/app/terms/page.tsx`, `src/app/refunds/page.tsx`. No
  Privacy Policy page yet.
- No age gate/affirmation at signup (`src/app/signup/page.tsx`).
- Shop (`src/app/shop/page.tsx`) already discloses per-skin wheel odds
  (`formatOddsPercent`) — good practice that's already done.

## 2. GDPR

### 2.1 Privacy Policy page (missing — needs to be written)

Must cover: what's collected (email, chat, gameplay stats, payment metadata), why
(contract performance for gameplay; legal obligation for financial records), who it's
shared with (Stripe, Resend, Sentry, Hetzner as processor), retention periods, user
rights (access/export/deletion), and a contact address for data requests.

### 2.2 Data subject rights (access, deletion, portability)

Articles 15/17/20 require us to be *able* to fulfill access, deletion, and
portability requests within 30 days — **self-service tooling is not legally
required**. A documented manual process (user emails us, we pull/delete the data by
hand or script, we confirm) is fully compliant at our current scale.

What's required either way:
- An actual internal process/runbook: which tables to query or anonymize, who's
  responsible, how the 30-day clock is tracked.
- **Identity verification** before acting on a request — our existing session-token
  auth (the same pattern `get_player_messages` uses) already proves account
  ownership, which is cleaner than trusting an anonymous inbound email.
- A **retention carve-out for financial records**: "delete my account" can't mean
  wiping Stripe order history — tax law requires retaining transaction records for
  years. The Privacy Policy needs to say gameplay/chat data is erased but payment
  records are retained per legal obligation.

Self-service (`GET /export_my_data`, `POST /delete_my_account`, reusing the existing
token-gated route pattern) would remove the "did we actually hit 30 days" risk
entirely and is a relatively small lift given the auth plumbing already exists — worth
doing once the manual process is documented, not necessarily before.

### 2.3 Data Processing Agreements (DPAs)

Confirm a signed/accepted DPA is on file for each processor: Stripe (standard DPA,
usually auto-accepted via ToS), Resend, Sentry, and Hetzner (they offer one for
exactly this — worth explicitly signing now that the DB is self-hosted there).

### 2.4 Sentry PII scrubbing

Verify `sentry_sdk.init(...)` (config.py) isn't sending emails/IPs into breadcrumbs
or event payloads by default — set `send_default_pii=False` and add scrubbing rules
for any fields that could carry personal data.

### 2.5 Data breach notification plan

Have a short internal doc: who gets notified internally, and the 72-hour-to-authority
notification clock GDPR imposes if personal data is actually breached.

## 3. Consumer / payments law

### 3.1 EU 14-day digital-goods withdrawal right

EU consumers get a 14-day refund right on digital purchases *unless* they explicitly
waive it by consenting to immediate delivery at checkout. Confirm the checkout flow
captures this waiver and that `refunds/page.tsx` reflects it.

### 3.2 VAT

Selling digital goods to EU consumers past a small threshold requires VAT collection
via the EU's One-Stop-Shop (OSS) scheme. Stripe Tax can automate this — confirm
whether it's enabled.

### 3.3 PCI-DSS

Already minimal scope (SAQ A) since checkout is Stripe-hosted and we never see card
numbers. No action needed unless the checkout flow changes to collect card data
directly.

## 4. 🔴 Loot-box / chance-mechanic regulation

Wheel spins are sold for real money with randomized outcomes. Belgium's Gaming
Commission classifies paid loot boxes as gambling (effectively banned there); the
Netherlands has ruled similarly for some mechanics; other jurisdictions are actively
reviewing this. Per-skin odds disclosure (already implemented) helps and is
increasingly an app-store requirement, but it does **not** resolve the underlying
gambling-classification question — that's genuinely unsettled, jurisdiction-dependent
law.

Options to consider: a real legal opinion before EU-wide launch, and/or a geo-block
for the highest-risk jurisdictions (Belgium in particular) as a stopgap.

## 5. 🔴 European Accessibility Act (EAA)

Took effect June 2025. Applies to digital services/e-commerce sold to EU consumers,
which includes the shop/checkout flow. Broadly means the purchase flow should meet
something close to WCAG 2.1 AA (keyboard navigation, alt text, color contrast,
screen-reader compatibility). Easy to miss since it's newer than GDPR and not yet
audited here — needs an accessibility pass on at least `shop/page.tsx` and checkout
before EU launch.

## 6. Minors / age gate

No age check exists at signup today. GDPR requires parental consent for processing
under-16 data (under-13 in some member states); US COPPA sets the same federal floor
at 13. Since a browser game plausibly attracts minors, add an age-affirmation
checkbox at signup ("I am 13+ / 16+ years old"). This shifts us from "knowingly
collecting children's data" to "relying on a good-faith affirmation," the standard
practical approach — cheap to add, meaningfully reduces exposure.

## 7. Terms of Service completeness

Review `src/app/terms/page.tsx` explicitly covers:
- Virtual currency/items have no real-world cash value and aren't redeemable for
  money (protects the wheel-spin mechanic from being read as a financial
  instrument).
- Chat conduct rules and our right to moderate/ban.
- Account termination rights.
- Governing law / dispute jurisdiction.
- Minimum age (ties to §6).

## 8. Chat moderation / notice-and-action

With live chat, the EU's Digital Services Act expects a basic notice-and-action
mechanism even at small scale: a way for users to report abusive content, and a
process to act on it. Admin kick/ban tooling already exists on the backend — this
mainly needs a stated policy plus a user-facing report path.

## 9. Lower priority — revisit if we scale

- **CCPA (California)** — thresholds (revenue or data volume) we're very unlikely to
  hit yet; revisit if US traffic grows significantly.
- **Business/tax registration** — confirm we're actually set up to legally receive
  Stripe payouts and report VAT; separate from any website-side compliance work.
- **DMCA agent registration** — only relevant if we want to rely on US safe-harbor
  protection for user-generated content (chat, names) explicitly.

## 10. Status tracker

- [ ] Privacy Policy page written and published
- [ ] Data subject request runbook documented (manual process is sufficient for now)
- [ ] DPAs confirmed for Stripe / Resend / Sentry / Hetzner
- [ ] Sentry PII scrubbing configured (`send_default_pii=False` + rules)
- [ ] Data breach notification plan documented
- [ ] Checkout flow's 14-day withdrawal waiver confirmed present
- [ ] Stripe Tax / VAT handling confirmed
- [ ] Legal opinion obtained on loot-box/gambling classification 🔴
- [ ] Accessibility audit of shop/checkout flow against WCAG 2.1 AA 🔴
- [ ] Age-affirmation checkbox added at signup
- [ ] Terms of Service reviewed against §7 checklist
- [ ] Chat report-abuse path added (user-facing)
- [ ] Self-service data export/delete endpoints (optional, post-launch nice-to-have)
