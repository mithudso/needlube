# Needlube — Membership Dropship Store: Start-to-Finish Design Plan

**Business model:** members pay a monthly fee; in exchange they buy adult / sexual-wellness
products at near cost (Costco model — margin lives in the membership fee, not the products).
Catalog mirrors **sextoydistributing.com** (~3,553 products in the local clone). Fulfillment is
**dropship**. The whole system is **fully custom, self-hosted on a local server** the operator
controls end to end, and **automation-first**.

**Companion docs (research carried forward, not re-derived):**
[`adult-ecommerce-store-build-plan.md`](./adult-ecommerce-store-build-plan.md) (payments,
sourcing, MAP, compliance) and
[`membership-site-build-plan.md`](./membership-site-build-plan.md) (auth → entitlement → billing
architecture, schema, security).
**Precedence:** where those docs recommend Shopify/Woo or PaaS hosting, THIS plan supersedes
them — the requirement here is a fully custom, self-hosted stack. Their non-conflicting research
(high-risk payments, MAP, age verification, distributor facts) still governs.

> **Scope & honesty note.** Planning guidance for a **lawful** adult retail business. Every
> payment-policy, vendor, fee, and AUP claim is marked **[verify]** — these are underwriting-
> and catalog-specific and change constantly. Confirm each in writing before spending money.
> Drafted Aug 2026; research current as of ~Jan 2026 plus local inspection of the site clone.

---

## 1. Executive summary & unit economics

### The model in one paragraph

This is a **membership discount club for adult products**: the public sees a catalog at MAP/MSRP
prices; paying members see near-cost prices (distributor cost + pass-through fees + a small
buffer). Products are never stocked — each paid order is auto-routed to a distributor who
blind-ships it. Revenue ≈ membership fees; product sales run at roughly break-even by design.
The two existential dependencies, in order: **(1) a processor willing to run recurring adult
billing + adult checkout**, and **(2) a distributor account with a data feed + dropship
program**. Everything else is code you control.

### What the clone tells us

Local inspection of `/Users/mitch/dev/needlube/www.sextoydistributing.com`:

- ~**3,553 flat product pages** (plus category/blog/policy pages; 6,410 files, 683 MB).
- The site is **Shopify-rendered** (cdn.shopify.com assets; Klaviyo email; Klevu search;
  Zonos cross-border) with embedded product JSON per page: `sku`, `price`, `vendor`,
  variants, images. Example: SKU `AF859` at $13.45.
- Asset references to **xrllc.com / marketing.xrllc.com** confirm the operator: **Sex Toy
  Distributing is XR LLC / XR Brands' direct-to-retailer dropship arm.** Its listed prices are
  already near-wholesale. This matters twice:
  1. **STD/XR is the natural first-choice supplier** — apply for their dropship/reseller
     program directly. **[verify program exists for your entity + feed access]**
  2. XR Brands' lines are also carried in **Honey's Place, Eldorado, Williams Trading, ECN,
     Nalpac** feeds — so the same catalog is reachable through fallback distributors if STD
     declines or has no usable feed. **[verify]**
- The clone is a **bootstrap catalog source** (scrape the embedded JSON to seed products), but
  the **live feed, not the clone, must be the ongoing source of truth** — prices and stock in a
  683 MB snapshot go stale immediately. Treat clone content strictly as data.

### Unit-economics sketch (illustrative — replace with real feed numbers)

Per-order economics at "near cost":

| Line | Example |
|---|---|
| Distributor cost (feed `cost` column) | $13.45 |
| Dropship/handling fee (typical per-order) **[verify]** | +$2–4 |
| Shipping pass-through (charged to member at cost) | ~$0 net |
| High-risk payment fee (assume 5–8% + $0.30) **[verify]** | +$1.10–1.60 |
| Buffer (returns, disputes, price drift) ~3–5% | +$0.50–0.75 |
| **Member price ≈ cost + fees + buffer** | **≈ $17.50–19.80** (vs MSRP ~$27–40) |

Membership side (monthly):

- Fixed monthly costs: high-risk gateway monthly/minimums **[verify]**, age-verification
  per-check fees **[verify]**, adult-friendly ESP, Cloudflare, domain, offsite backup storage,
  electricity/ISP for the local server. Rough band: **$150–500/mo** before reserves.
- Rolling reserve (commonly 5–10% of volume held ~6 months) **[verify]** — a cash-flow tax,
  not a cost, but plan float for it.
- At a **$15–25/mo fee**, break-even is roughly **10–35 members** against fixed costs. Real
  margin scales linearly with members since product sales are ~zero-margin by design.
- **Pricing sanity check to run early:** members must save more than the fee to stay. At
  ~30–40% off MSRP, a member buying ~$50+/mo at MSRP-equivalent breaks even on a $15 fee.
  Churn will concentrate in members who buy once and leave — expect it; annual plans and
  savings-tracker UX ("you've saved $X this year") are the standard counters.

**One structural warning:** recurring **"discount/membership club" billing is itself a
high-risk card-network category** (negative-option rules, FTC click-to-cancel scrutiny),
stacked on top of the adult vertical. Disclose terms plainly, one-click cancel, email receipts
before each rebill. This is both compliance hygiene and chargeback defense. **[verify current
FTC negative-option rule status]**

---

## 2. Recommended technology stack

### Selection criteria (fixed by the requirements)

1. **Self-hostable** on a local Linux server — no mandatory SaaS in the request path.
2. **No deplatforming kill switches** — every vendor that CAN drop an adult business must be
   swappable or out of the critical path (this disqualifies PaaS hosting, Stripe-family
   billing, and SaaS auth as core components).
3. **Solo-maintainable** — one language where possible, boring well-documented parts.
4. **Automation-friendly** — feed ingest, order routing, billing sync all headless/scriptable.
5. **High-risk-gateway compatible** — checkout and recurring billing must work with
   CCBill/Segpay/NMI-class rails, keeping card data off your server.

### The stack

| Layer | Pick | Why (vs rejected alternatives) |
|---|---|---|
| Language/runtime | **TypeScript / Node.js** | One language across storefront, commerce, workers. (Python/Django viable; splits the stack. PHP → only if WooCommerce fallback chosen.) |
| Storefront | **Next.js (App Router), server-side gating** | Server Components mean unentitled HTML literally never contains member prices (MAP requirement). Per membership-site plan §2.1. (SvelteKit/Remix equal; Next.js = ecosystem default.) |
| Commerce engine | **Medusa v2** (open-source, Node/TS, Postgres) | Self-hosted cart/orders/catalog/admin + custom payment-provider and fulfillment plugins — you write the NMI/CCBill provider once instead of building commerce from scratch. **[verify current Medusa v2 module APIs]** (Saleor: solid but Python/GraphQL, heavier ops. Custom-from-scratch: months of undifferentiated cart/order work. Shopify/BigCommerce: SaaS kill switch + adult limits — rejected per precedence rule.) |
| Database | **PostgreSQL 16 + RLS** | Entitlement core is relational and money-adjacent; RLS is the structural backstop against IDOR/entitlement leaks (membership plan §2.3). Medusa requires Postgres anyway — one database. (MongoDB: viable, you know it, but you'd hand-build the enforced-filter layer AND still run Postgres for Medusa. Keep Mongo for analytics if wanted.) |
| Cache/queue | **Redis + BullMQ** | Feed-sync jobs, order-routing jobs, webhook processing, dunning retries — durable queues with retry/backoff, self-hosted. |
| Auth | **Better Auth (self-hosted, in-app)** — or Auth.js | Criterion 2 kills SaaS auth: Clerk/Auth0 are AUP kill switches and monthly cost (membership plan recommended Clerk under PaaS assumptions — superseded). Self-hosted auth means YOU own MFA, resets, session security for sensitive PII — accept that burden deliberately; §7. **[verify Better Auth maturity/MFA support]** (Keycloak: gold-plated but a whole Java service to babysit — overkill solo.) |
| Recurring billing + checkout | **High-risk gateway**: MSP-placed merchant account + **NMI** (Customer Vault tokenization + recurring), or **CCBill/Segpay** | The only realistic adult rails (both companion docs). NMI = one processor for BOTH membership rebills and product checkout, hosted/tokenized fields (Collect.js) keep you SAQ-A-ish. CCBill FlexForms = adult-native alternative, subscription-first. **[verify recurring + physical goods + written pre-approval — Phase 0 gate]** (Stripe Billing / Paddle / Lemon Squeezy: prohibited/restricted for adult — rejected.) |
| Feed/ingest pipeline | **Custom Node workers** (BullMQ scheduled jobs) | Distributor CSV/XML/FTP/API → normalize → upsert Medusa catalog. Aggregators (Spark Shipping, Inventory Source, Flxpoint) are a paid SaaS layer you can add later if multi-distributor routing gets hairy — start direct. **[verify STD/XR feed format]** |
| Reverse proxy / TLS | **Caddy** (or Traefik) in Docker | Auto-TLS, dead simple config, self-hosted. |
| Edge shield | **Cloudflare (free/pro) — DNS proxy or Tunnel** | Hides home IP, absorbs DDoS, CDN for images, no inbound port-forward needed with Tunnel. Cloudflare permits lawful adult content on CDN/DNS **[verify current CF ToS/AUP for your catalog]**. Kill-switch note: CF is swappable (any CDN/tunnel) and not data-bearing — acceptable edge dependency. |
| Containers/ops | **Docker Compose** on Debian/Ubuntu LTS | One `compose.yml`: caddy, next, medusa, postgres, redis, workers, monitoring. (K8s: absurd overkill for one box.) |
| Monitoring/backup | **Uptime Kuma + Grafana/Loki (or Netdata) + restic → offsite (B2/S3)** + nightly `pg_dump` | Self-hosted observability; encrypted offsite backups are non-negotiable — the server is in your house. |
| Email | **Adult-friendly ESP/SMTP** **[verify — mainstream ESPs restrict adult]** | Transactional (receipts, rebill notices, tracking) + marketing. Self-hosted Postal/Mailcow possible but deliverability from a residential-adjacent IP is a losing fight — use a relay. |
| Age verification | **Yoti / Veratad / AgeChecked / Didit** (API) **[verify state coverage + per-check cost]** | ID-grade checks where shipped-to state requires; simple age gate elsewhere. Store the attestation result, never the ID image. |

**Fallback stack (named for honesty):** self-hosted **WooCommerce** + Wholesale Suite +
existing NMI/Authorize.net/CCBill plugins gets to market fastest with off-the-shelf adult
high-risk integrations — at the price of PHP/WordPress maintenance and plugin sprawl. Choose it
only if the Medusa payment-provider integration (the one real custom-code risk in the primary
stack) proves harder than expected in Phase 2. Everything else in this plan (hosting,
entitlement model, feed pipeline concept, compliance) survives that swap.

---

## 3. System architecture

```
                       ┌────────────────────────── Cloudflare (DNS proxy or Tunnel) ─────────────┐
                       │  TLS · DDoS · CDN · hides home IP                                       │
                       └───────────────┬─────────────────────────────────────────────────────────┘
   LOCAL SERVER (Docker Compose)       │
   ┌───────────────────────────────────▼───────────────────────────────────────────────────────┐
   │  Caddy (reverse proxy, auto-TLS on LAN side)                                              │
   │     ├── Next.js storefront ── server-side entitlement gating (member prices never in      │
   │     │        │                 public HTML; age-gate; account portal)                     │
   │     │        ▼                                                                            │
   │     ├── Medusa v2 (catalog · cart · orders · admin) ── custom payment provider ──────────┼──► High-risk gateway
   │     │        ▲                                          (NMI Collect.js hosted fields /  │    (NMI vault+recurring
   │     │        │                                           CCBill FlexForms — card data    │     or CCBill/Segpay)
   │     │        │                                           never touches this box)         │         │ webhooks
   │     ├── Workers (BullMQ):                                                                │◄────────┘
   │     │     • feed-sync (cron: pull distributor feed → normalize → upsert catalog,         │
   │     │       price rules, OOS handling)                                                   │
   │     │     • order-router (paid order → place dropship order @ distributor → store        │──► Distributor
   │     │       supplier order id)                                                           │    (STD/XR primary;
   │     │     • tracking-poller (fetch ship/track → email member)                            │     Honey's/Eldorado/
   │     │     • billing-sync (gateway webhooks/postbacks → subscriptions → access_grants)    │     Williams fallback)
   │     │     • dunning · reconcile (nightly provider poll) · savings-tracker                │
   │     ├── PostgreSQL (RLS)  ·  Redis                                                       │
   │     └── Uptime Kuma · Grafana/Loki · restic ──────────────────────────────────────────────┼──► offsite backup (B2/S3)
   └───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow, end to end:** distributor feed → feed-sync worker → Medusa catalog (cost, MAP,
MSRP, stock per SKU) → Next.js renders public price (≥ MAP) or member price (server-computed
from entitlement) → cart/checkout in Medusa → payment via gateway-hosted fields → `payment
succeeded` → order-router places dropship order with distributor (blind-ship) → tracking-poller
emails tracking → nightly reconcile audits everything.

**Entitlement spine (verbatim from the membership plan, unchanged):** billing state is the
input; a server-enforced entitlement check is the output; a signed, idempotent webhook keeps
them in sync. The app reads `access_grants` on every request — never the gateway, never a JWT
claim alone. Grant on `payment succeeded`, never on redirect. Nightly reconcile poll backstops
missed webhooks. Instant-revoke path (`revoked_at`) for chargebacks/fraud.

**Membership → price mapping:**

| Tier | Sees | Mechanism |
|---|---|---|
| Anonymous / logged-out | MAP (or MSRP) only | Public HTML never contains member price — MAP compliance is structural, not cosmetic |
| Registered, unpaid | MAP + "join to unlock ~X% off" teaser (percentage, never the number) **[verify each brand's MAP policy allows even %-savings claims]** | Server checks grants → none |
| **Member (active sub)** | Near-cost price | Server computes price per request from `access_grants`; price-in-cart pattern if a MAP policy restricts logged-in display **[verify per brand]** |

---

## 4. Data model

Postgres. The `members / subscriptions / access_grants / entitlement_events` tables are adopted
**unchanged** from `membership-site-build-plan.md` §2.3 (with `tier` values simplified to
`retail | member`; no wholesale tier at launch). Medusa owns its own product/order tables;
these are the custom additions that wire it to suppliers and billing:

```sql
-- supplier catalog identity (Medusa product/variant ←→ distributor SKU)
supplier_skus (
  id              uuid primary key,
  variant_id      text not null,            -- Medusa variant id
  supplier        text not null,            -- 'std_xr' | 'honeys' | 'eldorado' | ...
  supplier_sku    text not null,
  cost            numeric(10,2) not null,   -- feed cost column
  map_price       numeric(10,2),            -- feed MAP column (public floor)
  msrp            numeric(10,2),
  qty_on_hand     int not null default 0,
  last_synced_at  timestamptz not null,
  unique (supplier, supplier_sku)
)

-- one row per outbound dropship placement (an order may split across suppliers)
dropship_jobs (
  id                 uuid primary key,
  order_id           text not null,          -- Medusa order id
  supplier           text not null,
  supplier_order_id  text,                   -- filled once placed
  status             text not null default 'pending'
                     check (status in ('pending','placed','shipped','delivered',
                                       'failed','cancelled')),
  tracking_number    text,
  tracking_carrier   text,
  attempts           int not null default 0, -- retry/backoff bookkeeping
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
)

-- feed sync audit (what changed, when; drives price-drift alerts)
feed_sync_runs (
  id uuid primary key, supplier text, started_at timestamptz, finished_at timestamptz,
  skus_seen int, skus_updated int, skus_zeroed int, errors jsonb
)

-- member savings ledger (retention UX: "you've saved $X")
member_savings (
  member_id uuid references members(id), order_id text,
  msrp_total numeric(10,2), paid_total numeric(10,2), at timestamptz default now()
)

-- age-verification attestations (result only — never store ID documents)
age_checks (
  member_id uuid references members(id), provider text, result text,
  method text,               -- 'id_scan' | 'estimation' | 'self_attest'
  state_context text,        -- ship-to state that required it
  checked_at timestamptz default now()
)
```

**RLS policies:** members read only their own `members / subscriptions / access_grants /
member_savings / age_checks / orders` rows; `supplier_skus.cost` is **never** exposed through
any member-facing query (member price is computed server-side; cost stays internal). Workers
connect with a service role.

---

## 5. Payments plan (the existential dependency)

Adopt the companion docs' analysis wholesale; the self-hosted decision changes **nothing**
about the money rails. Concretely:

1. **Default: one high-risk relationship for both charge types.** MSP-placed high-risk
   merchant account + **NMI** gateway: Customer Vault token for the monthly membership rebill,
   same account for product checkout. One underwriting story ("membership discount club for
   adult novelty retail" — describe it exactly). **[verify: recurring + physical goods +
   membership-club model all approved in writing]**
2. **Adult-specialist alternative:** **CCBill or Segpay** — subscription-native, discreet
   descriptors, chargeback tooling; confirm physical-goods retail support and how checkout
   integrates with a custom (Medusa) cart. **[verify]**
3. **Card data never touches the server.** Gateway-hosted fields / FlexForms only. Store
   provider token + subscription id + status; PCI stays SAQ-A-ish. **[verify with gateway]**
4. **Fallbacks if nobody will do recurring adult billing at workable terms** (decide at the
   Phase 0 gate, don't improvise later):
   - **Annual membership, single charge** — same entitlement machinery, `expires_at` = +1yr,
     no rebill surface, far less negative-option risk.
   - **Prepaid credit packs** — member buys $100 store credit (one-time charges), membership
     entitlement rides along; no recurring rail at all.
   - **Free membership at launch, gated on registration + age check** — prove the store and
     dropship loop first, add the paid tier once a processor relationship matures (the
     membership plan's "option 3" adapted to consumer membership).
5. **Do NOT** frame the membership fee as a non-adult charge on a mainstream biller. The fee
   exists to discount adult products; misdescribing it is the classic account-freeze trigger
   (membership plan §2.4 option 2 analysis — adopted unchanged).

---

## 6. Automation pipeline (the "as automated as possible" requirement, made concrete)

| # | Job | Trigger/cadence | Behavior | Failure handling |
|---|---|---|---|---|
| 1 | Catalog bootstrap | once | Parse clone's embedded product JSON (~3,553 pages) → seed Medusa catalog + `supplier_skus` skeleton | Idempotent upsert; re-runnable |
| 2 | Feed sync | hourly (or feed's native cadence) **[verify]** | Pull distributor feed → upsert cost/MAP/MSRP/qty; recompute prices: public = max(MAP, floor); member = cost + fees + buffer, clamped ≥ any logged-in MAP floor **[verify policy]** | Diff alert on >N% cost drift; never auto-price below MAP; `feed_sync_runs` audit |
| 3 | OOS handling | with #2 | qty ≤ 2 → treat as OOS (buffer against races); auto-unpublish; auto-republish on restock | Zeroed-SKU count alert if feed looks broken (mass-zero = probably a bad file, halt don't unpublish 3,000 items) |
| 4 | Order routing | on `payment_captured` event | Create `dropship_jobs`; place order via distributor API/EDI (or structured email fallback) with blind-ship flag; record `supplier_order_id` | Retry w/ backoff ×3 → alert + park in admin queue (manual) |
| 5 | Tracking sync | poll 4×/day per open job | Pull ship status → email member tracking (discreet sender name) | Job stuck >72h `placed` → alert |
| 6 | Billing sync | gateway webhook/postback, real-time | Signed, idempotent → upsert `subscriptions` → recompute `access_grants` → audit event | 5xx = provider retries; event-id dedupe ledger |
| 7 | Reconcile | nightly | Poll gateway for every non-canceled sub; re-derive grants; diff vs DB | Any drift = alert (this catches missed webhooks — the "canceled but still shopping at cost" bug) |
| 8 | Dunning | on `payment_failed` | Grace until `current_period_end`; retry schedule per gateway; 2 emails + in-app banner; then revoke grant | Fully automatic |
| 9 | Rebill pre-notice | T-3 days before rebill | Email "you'll be charged $X on date" (negative-option hygiene, chargeback defense) | Automatic |
| 10 | Backups | nightly + weekly restore-test | `pg_dump` + restic encrypted → offsite; **quarterly restore drill** | Backup-failed alert is a P1 |
| 11 | Ops watchdog | continuous | Uptime Kuma external probe (via Cloudflare), disk/RAM alerts, cert expiry | Push notification |
| 12 | Savings tracker | on order completion | Write `member_savings`; monthly "you saved $X" email (retention) | Automatic |

**Residual manual work (be honest about it):** chargeback/dispute responses; distributor
exceptions (mis-ships, damaged goods, returns); customer support; MAP-policy changes;
processor/distributor relationship management; product-copy rewrites for SEO (the
duplicate-feed-content problem — store plan §5 — is a content treadmill no cron job fixes);
quarterly restore drills; annual resale-cert/underwriting paperwork.

---

## 7. Compliance & security checklist

- **Age verification:** state-conditional. Robust age gate site-wide; **ID-grade verification
  (Yoti/Veratad/AgeChecked/Didit) keyed to ship-to state** where law requires; block states you
  can't serve compliantly. Store result + method, never documents. **[verify current state
  list — 25+ states and moving; get legal advice]**
- **Entitlement/IDOR (the #1 membership vuln):** subject always derived from session, never
  request ids; RLS as backstop; deny-by-default routes; gated fields omitted server-side, never
  sent-then-hidden; automated tests where user A attempts user B's orders/grants/prices and
  asserts 403/empty. (Membership plan §5.1 adopted unchanged.)
- **Cost-price secrecy:** distributor `cost` and below-MAP member prices never appear in
  public HTML, sitemaps, JSON payloads to logged-out users, or cached shared responses. Never
  cache a per-user gated response at Cloudflare — `Cache-Control: private` on all
  member-priced routes; CDN caches images/static only.
- **Sensitive-data privacy:** purchase history here is sexual-preference data. Minimize
  collection; no third-party ad pixels on product/checkout pages; analytics self-hosted
  (Plausible/Umami) or none; encrypted disks (LUKS) on the local server — it's a physical box
  in a home, physical theft = data breach without disk crypto; hard-delete flow; plain privacy
  policy. GDPR/CCPA-style rights honored.
- **PCI:** hosted fields/tokenization only; SAQ-A(-ish) posture confirmed with the gateway
  **[verify]**; no PAN, CVV, or track data ever on the box.
- **Self-hosted auth burden (accepted deliberately):** MFA available (mandatory for admin),
  bcrypt/argon2 hashing, rate-limited login, breached-password checks, session rotation,
  HttpOnly/Secure/SameSite cookies. This is the cost of removing the SaaS-auth kill switch.
- **Home-server exposure:** only Cloudflare Tunnel (or 443 via Caddy) reaches the box; SSH via
  Tailscale/WireGuard only, never internet-exposed; automatic security updates; UPS; residential
  ISP ToS may prohibit servers **[verify — business line or colo the box later if it matters]**.
- **Discreet operations:** neutral billing descriptor (set at gateway), plain packaging
  (distributor blind-ship — confirm exact return-address name **[verify]**), discreet email
  sender name.
- **Business/legal:** LLC + EIN + state resale certificate (required for distributor accounts);
  sales-tax registration/nexus; CA Prop 65 warnings (the clone carries a Prop 65 page — mirror
  that obligation); clear ToS with membership terms, cancellation, and refund policy visible
  (underwriters check for these pages).

---

## 8. Phased roadmap — validation gates before build

**Guiding principle (inherited from both companion docs): validate the two external
dependencies — processor and distributor — before writing much code. A finished platform that
can't charge cards or place dropship orders is the classic failure mode.**

**Phase 0 — Payment validation (gate: written pre-approval).**
Entity + EIN + resale permit. One-page description of the exact model ("paid membership club;
members buy adult novelty products near cost; recurring monthly fee; physical goods
dropshipped"). Written quotes from 2–3 providers (MSP+NMI; CCBill; Segpay): recurring OK?
membership-club model OK? physical goods OK? rates, reserve %, reserve term, monthly minimums,
descriptor options. **No approval → pick a §5.4 fallback (annual / prepaid / free-at-launch)
before proceeding — do not stall the build indefinitely, but do not build the rebill machinery
speculatively.**

**Phase 1 — Sourcing validation (gate: feed access in hand).**
Apply to **STD/XR directly** for a dropship/reseller account; simultaneously apply to
**Honey's Place** (hourly feed, no-minimum dropship reputation) and **Eldorado or Williams
Trading** as fallbacks. Obtain in writing: feed format + fields (cost/MAP/MSRP/qty), dropship
fee schedule, blind-ship details, MAP policy wording (does it permit logged-in member pricing?
price-in-cart?), order-placement API/EDI mechanics. **[verify all]** Note: distributors often
want to see a live retail site before approving — stand up a minimal public brand/coming-soon
site early to break the chicken-and-egg.

**Phase 2 — Core platform (first code).**
Docker Compose skeleton (Caddy, Postgres, Redis). Medusa v2 + Next.js storefront. Better Auth
with `members` table + tiers-as-claims re-checked server-side. Catalog bootstrap from the clone
(job #1). Entitlement schema + `canAccess` + RLS + **IDOR tests now, before real data**.
Age gate. Public storefront shows MAP prices only.

**Phase 3 — Money loop.**
Gateway integration as a Medusa payment provider (hosted fields). Membership subscribe flow (or
chosen fallback model). Signed idempotent webhook → `subscriptions` → `access_grants`. Nightly
reconcile. Dunning + pre-rebill notices. Full lifecycle test: subscribe → member price appears →
card decline → grace → revoke → resubscribe. (This phase shrinks dramatically if Phase 0
selected the free-at-launch fallback.)

**Phase 4 — Fulfillment loop.**
Live feed sync replacing bootstrap data (jobs #2–3). Order-router + tracking-poller (jobs
#4–5) against the distributor's real API — place test orders to yourself, verify blind-ship
packaging and descriptor. Price-rule engine with MAP clamps.

**Phase 5 — Hardening + launch.**
Backups + restore drill; monitoring/alerts; load-test gated paths confirming no shared-cache
leaks; security pass (OWASP + the §7 checklist); privacy policy/ToS/Prop 65/shipping/returns
pages (underwriting requires them); soft launch to a handful of members; watch
`entitlement_events`, `feed_sync_runs`, `dropship_jobs` for a full billing cycle.

**Phase 6 — Growth (post-launch).**
SEO content engine (rewrite top-margin product copy first — duplicate-feed-content fix),
adult-friendly ESP flows, affiliates/creators, savings-tracker retention loop, evaluate second
distributor for fill-rate routing, revisit paid-tier pricing with real basket data.

---

## 9. Top risks & open questions

1. **Recurring adult billing approval** — existential; Phase 0 gate. Membership-club framing
   adds negative-option scrutiny on top of the adult vertical. Mitigation: fallback models
   (annual/prepaid/free-at-launch) designed in from day one. **[verify]**
2. **STD/XR dropship program** — does XR grant a feed + dropship account to a new
   members-only discounter at all? Their MAP interests cut against your near-cost model.
   Mitigation: Honey's/Eldorado/Williams carry the same XR lines. **[verify]**
3. **MAP vs near-cost member pricing** — if key brands' MAP policies restrict even logged-in
   below-MAP display, the core value proposition needs price-in-cart or per-brand exclusions.
   Get every MAP policy in writing before marketing "near cost." **[verify]**
4. **Home-server realities** — residential ISP ToS, upload bandwidth, power/uptime, physical
   security of a box holding sensitive PII. Mitigations in §7; be ready to colo or move to an
   adult-tolerant VPS (the stack is portable by design) if it becomes the bottleneck.
5. **Unit economics under the fee stack** — high-risk rates + reserves + dropship fees on
   ~zero-margin products mean the membership fee carries everything; model with real feed
   costs in Phase 1 before setting the fee. **[verify against live feed + written quotes]**
6. **Solo-operator bus factor** — chargebacks, distributor exceptions, and support are manual
   (§6 residual list); automation reduces but does not eliminate daily ops. Budget ~1h/day
   at modest volume.
7. **Legal drift** — state age-verification laws and FTC negative-option rules are moving;
   schedule a quarterly compliance re-check. **[verify]**

---

## Self-check (per prompt's quality bar)

Hard requirements: (1) membership-fee / near-cost / dropship model — §1, §3, §5, §6 ✓;
(2) self-hosted local server w/ networking, TLS, DDoS, backups — §2, §3, §7 ✓;
(3) automation-first with residual-manual list — §6 ✓; (4) adult constraints (high-risk both
rails, age verification, MAP, discretion, privacy) — §5, §7, throughout ✓. Required sections
1–9 all present. All unverifiable vendor/policy claims marked **[verify]**.

## Sources
- Companion research docs (this repo): `adult-ecommerce-store-build-plan.md`,
  `membership-site-build-plan.md` (their source lists apply here too).
- Local clone inspection: `/Users/mitch/dev/needlube/www.sextoydistributing.com` (product-page
  JSON: sku/price/vendor; cdn.shopify.com, klaviyo, klevu, zonos, xrllc.com references).
- Skills consulted: `adult-product-distribution-and-dropship-sourcing` (distributor programs,
  feeds, MAP mechanics, onboarding checklist), `membership-site-architecture` (entitlement
  spine, webhook→grant sync, canonical schema, enforcement rules).
