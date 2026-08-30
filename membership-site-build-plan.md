# Custom Membership-Site Build Plan — Adult / Sexual-Wellness Ecommerce

**Decision already made:** build a **custom** membership site (not a packaged membership
platform), connected to the adult-toy / sexual-wellness ecommerce project (dropship + distribution
sourcing, members-only / wholesale pricing).
**Audience for this doc:** the founder (you) + whoever writes the code.
**Companion doc:** [`adult-ecommerce-store-build-plan.md`](./adult-ecommerce-store-build-plan.md)
(the store-side decisions this plan stays consistent with: Squarespace can't be the transactional
core; Shopify + high-risk gateway or WooCommerce recommended; adult = high-risk payments
everywhere).

> **Scope & honesty note.** Engineering + ecommerce guidance for a **lawful** business. Every
> payment-policy, host-AUP, tool-pricing, and vendor claim is marked **[verify]** — these change
> constantly and are underwriting- and catalog-specific. Nothing here guarantees any processor,
> billing platform, or host will accept *your* specific catalog or business. Confirm each in
> writing before you spend money or write much code. Research current as of ~Jan 2026; drafted
> Aug 2026.

---

## 1. Build vs buy — the settled decision (and the one thing it does NOT fix)

You've decided to **build custom**. Good — a custom app buys you exactly the things packaged
membership platforms (Memberstack, MemberSpace, Outseta, Circle, Whop, WooCommerce Memberships,
etc.) can't cleanly give you together: your own auth + entitlement model, per-tier gated wholesale
pricing wired to your catalog, full control of UI/UX and customer data, and no platform that can
deplatform you for the vertical on a whim.

### The unmissable caveat: custom build does NOT bypass the adult high-risk payment restriction

> **A custom app controls auth, entitlement, UI, and data. It does NOT control the money rails.**
> Any adult-related charge still has to settle through a card processor, and the *entire adult
> vertical is high-risk everywhere* — mainstream processors restrict or reject it. This is true for
> **both** kinds of charge in this business:
>
> 1. **Store checkout** (buying a toy) — needs a high-risk merchant account / gateway (per the
>    store-build plan: CCBill / Segpay / Verotel, or an MSP-placed high-risk acquirer + NMI /
>    Authorize.net). **[verify]**
> 2. **Recurring membership fee** (the subscription that unlocks the members-only tier) — this is
>    *also* a card charge, and mainstream **subscription-billing** products reject adult just like
>    mainstream checkout does. **Stripe Billing, Paddle, and Lemon Squeezy all sit on top of the
>    same prohibited/restricted-adult policies** — see §2. **[verify]**

Writing a beautiful Next.js entitlement engine changes none of that. The hard external dependency —
"can I actually charge a card, on a recurring basis, for an adult-adjacent product, at workable
fees?" — is **unchanged by going custom** and remains the #1 existential risk. It is validated in
**Phase A, before you build anything** (§6). Building the app first and discovering you can't bill
is the classic, expensive failure mode here.

**What custom build *does* solve:** identity, tiers/roles, entitlement logic, gated pricing display,
SSO with the store, data ownership, and platform-independence. **What it does not solve:** getting
paid. Keep those two mentally separate for the whole project.

---

## 2. Recommended stack

Constraints driving these picks: adult/high-risk vertical; members-only + wholesale tiered pricing;
you already know **MongoDB** (from the aggregaytor project); must not leak gated content; must
integrate with a Shopify/Woo store; solo/lean team; sensitive customer data.

### 2.1 Frontend — **Next.js (App Router), server-side gating**

**Recommendation: Next.js on the App Router, with all gating decisions made on the server
(Server Components / route handlers / middleware), never in the browser.**

Why SSR/edge gating matters here specifically:
- **Client-side gating leaks.** If the server sends the gated content (wholesale prices, member
  catalog, downloads) to the browser and CSS/JS just *hides* it, anyone can read it in DevTools,
  "View Source," or the network tab. For **wholesale pricing** that's a MAP/contract problem (you
  promised the brand that below-MAP prices aren't publicly visible); for members-only content it's
  straight theft of the thing people pay for.
- **Server Components + route handlers** let you *never render* gated data unless the request is
  authenticated and entitled. The unentitled visitor's HTML simply doesn't contain the price.
- **Middleware / edge** gives you a cheap first gate (redirect anonymous users off `/members/*`,
  attach the session) before the request even hits a page — but treat middleware as UX/routing, not
  as the security boundary. **The authoritative entitlement check happens in the data layer**
  (§3), because middleware can be bypassed by hitting an API route directly.

Honest tradeoffs: Next.js SSR + a database + auth is more moving parts than a static SPA; you'll run
a Node server (or serverless functions) and think about caching carefully (never cache a
per-user gated response at a shared edge). If you truly wanted minimal infra you'd buy a platform —
but you've chosen custom, and Next.js is the pragmatic default for content-gating done right.
(Alternatives: SvelteKit/Remix/Nuxt all do SSR gating equally well; pick Next.js for the ecosystem
and hiring pool unless you have a reason.)

### 2.2 Auth — **Clerk** (recommended), with Supabase Auth as the budget/data-colocated alternative

| Option | Fit for this project | Notes |
|---|---|---|
| **Clerk** *(recommended)* | Fastest path to production-grade auth with **organizations/roles** and drop-in Next.js components; supports custom **claims/metadata** you can put tiers into | Paid as you scale; you're renting identity. **[verify pricing]** Confirm its AUP is fine with an adult-*adjacent* wellness brand (auth provider, not payment — usually fine, but check). |
| **Supabase Auth** | Strong if you also pick Supabase Postgres — auth + DB + RLS in one place; tiers via JWT `app_metadata` drive **Row-Level Security** | More wiring than Clerk for orgs/roles UI; but colocating auth with the DB makes the RLS story (§2.3) very clean. Best value pick. |
| **Auth0 (Okta)** | Enterprise-grade, very flexible rules/actions for custom claims | Heavier, pricier at scale, more than a lean solo build needs. |
| **NextAuth / Auth.js** | Free, in-your-codebase, no vendor | You own sessions, password resets, MFA, email verification, breach response — real work and real risk on **sensitive adult-customer PII**. Only if you want zero auth vendor and accept that burden. |

**Recommendation: Clerk** if you want to move fast and keep auth out of your threat surface;
**Supabase Auth** if you go Postgres and want auth+data+RLS unified (also the cheaper long-run
option). Either way, **model tiers as roles/claims** (`tier: "retail" | "member" | "wholesale"`,
plus `wholesale_status: "pending" | "approved"`) carried in the token, and **re-check them
server-side against the DB** — never trust the client's copy of the claim for a money-affecting
decision.

### 2.3 Database — **the members/subscriptions/entitlements model** (Postgres+RLS recommended; MongoDB viable)

You know MongoDB from aggregaytor, so this is a real fork:

- **Postgres (Supabase/Neon) with Row-Level Security — recommended for *this* domain.** Membership,
  subscriptions, and entitlements are a **relational, integrity-critical, money-adjacent** model:
  one user ↔ many subscriptions ↔ many access grants, with foreign keys and constraints you *want*
  the database to enforce. **RLS** lets you enforce "a user can only read their own grants" *in the
  database itself*, which is the single strongest structural defense against the #1 membership vuln
  (IDOR / entitlement bypass, §5). That defense-in-depth is worth more here than schema flexibility.
- **MongoDB — perfectly viable, and you already know it.** Use it if you want to stay in one stack
  with aggregaytor, or you prefer the document model. You *give up* built-in RLS, so **every**
  entitlement read/write must go through a server-side data-access layer that injects the
  `userId`/tenant filter on every query — no exceptions. That's a discipline you must not skip.
  MongoDB is a fine choice; it just moves more of the "never leak another user's entitlement"
  guarantee into *your* code instead of the engine.

**Verdict:** default to **Postgres + RLS** for the members/billing core specifically (let the DB be
the backstop); keep MongoDB in your toolbox for content/catalog/analytics where the document model
shines. If you'd rather not run two databases, MongoDB-only is acceptable *provided* you build the
enforced-filter data layer and test it hard.

**Canonical schema** (Postgres phrasing; the same shape maps to Mongo collections):

```sql
-- WHO
members (
  id            uuid primary key,             -- your internal id
  auth_user_id  text unique not null,         -- Clerk/Supabase/Auth0 subject
  email         text unique not null,
  tier          text not null default 'retail'      -- retail | member | wholesale
                  check (tier in ('retail','member','wholesale')),
  wholesale_status text default null                 -- null | pending | approved | rejected | expired
                  check (wholesale_status in ('pending','approved','rejected','expired')),
  resale_cert_url  text,                             -- for wholesale approval/tax exemption
  created_at    timestamptz not null default now()
)

-- THE MONEY STATE (mirror of the billing provider, kept in sync by webhook — §3)
subscriptions (
  id                 uuid primary key,
  member_id          uuid not null references members(id),
  provider           text not null,                 -- 'ccbill' | 'segpay' | 'stripe' | ...
  provider_sub_id    text not null,                 -- id in that provider
  plan_code          text not null,                 -- which membership plan
  status             text not null                  -- active | past_due | canceled | expired | trialing
                       check (status in ('active','past_due','canceled','expired','trialing')),
  current_period_end timestamptz,                    -- when access lapses if not renewed
  cancel_at_period_end boolean default false,
  updated_at         timestamptz not null default now(),
  unique (provider, provider_sub_id)
)

-- THE DERIVED TRUTH THE APP READS ON EVERY REQUEST
access_grants (
  id           uuid primary key,
  member_id    uuid not null references members(id),
  entitlement  text not null,                        -- 'wholesale_pricing' | 'members_catalog' | 'downloads' | ...
  source       text not null,                        -- 'subscription:<id>' | 'manual' | 'comp'
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz,                           -- null = no expiry; else hard stop
  revoked_at   timestamptz,                            -- set to kill instantly
  unique (member_id, entitlement)
)

-- append-only audit for disputes/chargebacks/debugging
entitlement_events (
  id uuid primary key, member_id uuid, event text, detail jsonb, at timestamptz default now()
)
```

Design intent: **`subscriptions`** is a faithful *mirror* of the billing provider (never your source
of truth for money — the provider is); **`access_grants`** is the **derived, app-owned truth** the
gating layer reads. Webhooks reconcile `subscriptions` → recompute `access_grants` (§3). The app
*never* asks the billing provider "is this person paid up?" on the request path — it reads
`access_grants`, which is fast and can't be knocked out by a provider outage.

### 2.4 Recurring billing — the honest, adult-constrained analysis

This is where the caveat from §1 bites. The clean-world answer would be "Stripe Billing or a
merchant-of-record like Paddle/Lemon Squeezy." **For an adult-adjacent business, that answer is
probably unavailable**, and pretending otherwise wastes your build.

| Option | Recurring? | Adult reality | Verdict |
|---|---|---|---|
| **Stripe Billing** | Excellent | Sits on Stripe's card account → **same restricted/prohibited-adult policy** as Stripe checkout. Sex toys are "restricted"; adult content prohibited; accounts declined or later frozen — which **breaks every active subscription** (tokens die with the account). **[verify]** | **Assume no** for anything explicit. |
| **Paddle** (MoR) | Excellent | AUP **explicitly prohibits** "sexually-oriented or pornographic products/services… or any other products/services intended for this industry." **[verify]** | **No.** |
| **Lemon Squeezy** (MoR) | Good (digital) | MoR carries the seller-of-record liability → strict AUP; adult/NSFW not supported in practice, and it's digital-goods-focused (not physical toys). **[verify]** | **No.** |
| **High-risk gateway's own recurring** (CCBill, Segpay, Verotel) | **Yes — this is their home turf** | These adult-specialist processors were **built for recurring adult billing** (subscriptions, rebills, discreet descriptors, chargeback tooling). They are the realistic way to charge a recurring adult membership fee. **[verify they support your exact model + physical-goods context]** | **The likely path.** |
| **MSP high-risk acquirer + NMI/Authorize.net** | Via the gateway's recurring/tokenization | The stack you're already standing up for store checkout can often *also* run the recurring membership charge — one processor relationship for both. **[verify recurring is included]** | **Strong option** — consolidate. |

**The framing decision you must make deliberately:**

Two charges exist — the **membership access fee** (recurring) and the **product purchase**
(one-time, at store checkout). You have three architectural choices, and they have very different
risk/complexity profiles:

1. **One high-risk processor handles both** (recommended default). Run the recurring membership fee
   *and* store checkout through your high-risk gateway (CCBill/Segpay, or MSP+NMI). Cleanest
   compliance story, one underwriting relationship, no awkward separation. **[verify the gateway
   does recurring + your platform + physical goods.]**

2. **Separate the "membership access fee" as a non-adult-framed digital product**, billed through a
   *mainstream* recurring platform, while adult product sales stay on the high-risk gateway. This is
   tempting ("the membership is just access to a wellness community/content, not a sex toy") — **but
   analyze it honestly, don't hand-wave it:**
   - If the membership *materially exists to sell adult products at wholesale*, a mainstream
     processor can reasonably view the fee as **part of the adult business** and shut it down —
     you'd be describing the charge one way and operating it another, which is exactly the
     "misrepresenting your business" trigger that gets accounts frozen. **[verify — and get it in
     writing; don't self-certify.]**
   - It only holds up if the membership is a **genuinely separable, non-adult product** (e.g. a
     real content/education/community subscription that stands on its own), sold under clear terms,
     not a thin wrapper over "pay us monthly to buy toys cheaper." If it's the latter, treat it as
     adult and bill it high-risk (option 1).
   - Even when defensible, you now run **two billing systems** and must **reconcile two providers**
     into one entitlement model — more webhook surface, more failure modes (§3, §5).

3. **No recurring fee at all — gate wholesale on approval, not on a subscription.** Many wholesale
   models don't charge a membership fee; they *approve* trade accounts (resale cert, application)
   and the "entitlement" is approval status, not an active subscription. This **sidesteps recurring
   adult billing entirely** for the wholesale tier and is worth seriously considering. A paid
   consumer "VIP member" tier can be added later once billing is proven. **Recommended to at least
   launch this way** — it removes the hardest dependency from the critical path.

**Recommendation:** Plan for **option 1** if you want a paid recurring membership (one high-risk
processor for everything), and **strongly consider launching with option 3** (approval-gated
wholesale, no recurring fee) so the whole business isn't blocked on "will someone do recurring adult
billing." Reserve option 2 only if the membership is a *real* standalone non-adult product — and
verify with the processor in writing, because getting caught reframing an adult charge is worse than
just using the high-risk rail.

### 2.5 Hosting / deploy — mind the adult-content AUPs

The processor problem has a quieter cousin: **some hosts restrict adult content too.** Verify the
AUP before you deploy, the same way you verify the processor.

| Host | Adult-content posture | Notes |
|---|---|---|
| **Vercel** | AUP restricts categories at its discretion; adult is a gray area — great Next.js DX but **confirm your specific content is allowed** before committing. **[verify]** | Best Next.js DX; risk is policy, not tech. |
| **Netlify** | AUP reserves the right to remove anything it deems **"objectionable" at sole discretion** — broad, discretionary, a risk for adult. **[verify]** | Same discretionary risk. |
| **Fly.io / Railway / Render** | Generally more permissive for lawful adult than the big PaaS, but **confirm each AUP**; you run closer to the metal. **[verify]** | Good middle ground: real servers, fewer content-police surprises. |
| **Self-host (VPS / your own infra)** | Maximum freedom; **maximum ops burden** (patching, backups, uptime, security). | Only if you want full control and can run it. |

**Recommendation:** develop on Next.js targeting a Node runtime, but **pick the host after reading
its current AUP against your actual catalog** — lean **Fly.io or Railway** if Vercel/Netlify's
discretionary clauses make you nervous about the adult vertical. Keep the app **portable** (plain
Next.js + your own DB, avoid deep proprietary lock-in) so a host that changes its mind can't take you
down. Same philosophy as choosing custom over a platform: don't hand anyone a kill switch.

**Stack summary (one line):** Next.js (App Router, server-side gating) · Clerk *or* Supabase Auth
(tiers as roles/claims) · Postgres+RLS for the members/billing core (MongoDB acceptable if you build
an enforced-filter data layer) · recurring billed through a **high-risk gateway** (CCBill/Segpay or
MSP+NMI) — *not* Stripe Billing/Paddle/Lemon Squeezy · hosted where the AUP verifiably permits
lawful adult (lean Fly/Railway).

---

## 3. Entitlement architecture

The whole system is one idea: **billing state is the input; a server-enforced entitlement check is
the output; a webhook keeps them in sync.**

### Billing-state → entitlement sync (the webhook loop)

```
[Billing provider]  --webhook-->  [your /webhooks/billing route]
   subscription.created/updated/           |
   payment_succeeded/failed/canceled       v
                                    1. verify signature (reject unsigned/forged)
                                    2. idempotency: dedupe by event id
                                    3. upsert subscriptions row (mirror provider truth)
                                    4. RECOMPUTE access_grants for that member:
                                         active/trialing  -> grant 'members_catalog','wholesale_pricing'
                                         past_due (grace)  -> keep grant until current_period_end
                                         canceled/expired  -> set revoked_at (or let expires_at lapse)
                                    5. append entitlement_events (audit)
```

Rules that keep this correct:
- **Provider is the source of truth for money; `access_grants` is the source of truth for access.**
  The app reads grants, not the provider, on the request path.
- **Verify webhook signatures and dedupe by event id.** Webhooks retry and arrive out of order; an
  unsigned or replayed event must not flip entitlement. Idempotency key = provider event id.
- **Don't grant on "checkout started" — grant on "payment succeeded."** And **reconcile on a
  schedule** (nightly poll of the provider) so a *missed* webhook can't leave someone entitled after
  they stopped paying, or locked out after they paid.
- **Grace vs hard-stop:** decide the `past_due` grace window explicitly (e.g. keep access until
  `current_period_end`, then revoke). Involuntary churn (card declines) is normal — a dunning window
  is customer-friendly, but it *is* free access, so bound it.
- **Instant revoke path:** `revoked_at` on the grant kills access immediately (fraud, chargeback,
  refund) without waiting for a billing cycle.

### The server-side gating rule (the one non-negotiable)

Every request for gated data runs, **on the server, against the database**:

```
canAccess(member, entitlement) =
    grant = access_grants.find(member_id = member.id AND entitlement = X)
    grant exists AND grant.revoked_at is null
      AND (grant.expires_at is null OR grant.expires_at > now())
```

- Runs in the **data-access layer** (or as a **Postgres RLS policy**), not in React, not in
  middleware alone. Middleware/route guards are UX; the DB-level check is the security boundary.
- **The object-ownership check is part of it:** when serving "member X's" anything, the query filters
  by the *session's* member id — never by an id from the URL/body (that's the IDOR fix, §5).
- Gated fields are **omitted from the response entirely** when not entitled (don't send-then-hide).

### How members-only WHOLESALE pricing maps onto tiers

Tying the members-only pricing skill's model to this membership app:

| Tier (role/claim) | Entitlement grant | What they see | Gating |
|---|---|---|---|
| **retail** (anonymous or basic account) | none | Public MAP price only | No wholesale price ever rendered to them |
| **member** (consumer VIP, optional paid) | `members_catalog` (+ maybe a standing member discount) | Member price / member content | Behind login; server-computed |
| **wholesale** (approved trade, resale cert) | `wholesale_pricing` (+ tax-exempt flag) | Below-MAP wholesale tiers, volume breaks, net terms | Behind login **and** `wholesale_status = 'approved'`; **price never in public HTML** (MAP) |

- **Price is computed server-side per request from the member's grants** — the same SKU renders a
  different price object depending on who's authenticated. The retail visitor's page literally does
  not contain the wholesale number (satisfies the MAP "not publicly advertised" posture from the
  pricing skill — **[verify against each brand's written MAP policy]**).
- **Wholesale is approval-gated, not just login-gated:** application (business name, resale/EIN),
  manual or auto review, then provision `tier='wholesale'` + `wholesale_status='approved'` + the
  `wholesale_pricing` grant + tax exemption. Reseller certs expire → set `expires_at` and reap.
- This is exactly why the pricing must live **behind the entitlement check**, and why the wholesale
  entitlement can be **decoupled from a subscription** (approval, not payment) — see §2.4 option 3.

---

## 4. Integration with the store (Shopify / Woo)

The store-build plan lands on **Shopify + high-risk gateway** (default) or **WooCommerce**. The
membership app has to relate to that store without duplicating the catalog or fracturing identity.

### Architecture choice

| Pattern | What it means | When |
|---|---|---|
| **A. Store *is* the app (extend the platform)** | Do membership/wholesale *inside* Shopify (B2B + wholesale app: Wholesale Gorilla / BSS / SparkLayer) or Woo (role-based pricing plugin). No separate custom app. | If the platform's native/app B2B tiers meet the need, this is *less* work than a custom app — reconsider whether you need the custom build for the pricing piece at all. |
| **B. Headless commerce + custom membership layer** *(the custom-build path)* | Your Next.js app owns identity, entitlement, member portal, and gated pricing; the **store platform owns catalog, cart, checkout, orders, and the high-risk gateway**. Your app calls the store via **Storefront/Admin API** (Shopify) or **REST API** (Woo). | When you want the custom membership UX/data ownership this whole plan assumes. **Recommended given the decision to build custom.** |
| **C. Fully custom commerce** | Build catalog + cart + checkout yourself too. | **Avoid.** Rebuilding PCI-scoped checkout + high-risk gateway integration from scratch is a huge, risky detour. Let Shopify/Woo own the money path. |

**Recommendation: B (headless commerce + membership layer).** Keep the **cart, checkout, catalog,
and the high-risk gateway inside Shopify/Woo** (they already solve PCI and the gateway integration);
your custom app is the **member portal, identity, entitlement engine, and gated-price computation**
that sits in front of / alongside it.

### Where each thing lives (pattern B)

- **Catalog & inventory:** store platform (fed by distributor feeds per the store plan). Your app
  *reads* products via API; it doesn't own them.
- **Cart & checkout & orders & payment:** store platform + high-risk gateway. **Don't rebuild this.**
- **Identity, tiers, entitlements, member portal, gated pricing display:** your custom app.
- **Wholesale price computation:** your app computes the entitled price and either (i) renders the
  member storefront itself pulling products via the Storefront API, or (ii) drives the platform's
  own customer-group/price-list mechanism (Shopify B2B catalogs / Woo roles) so the *platform's*
  checkout charges the right price. Prefer (ii) where possible so the price the customer is charged
  is enforced by the checkout, not just displayed by your app.

### SSO between store and member portal

- **One identity provider** (Clerk/Supabase/Auth0) is the source of truth. Bridge it to the store's
  customer accounts so a member doesn't log in twice:
  - **Shopify:** use **customer account / multipass-style SSO** (Plus) or map your auth user to a
    Shopify customer and tag it (`wholesale`, `member`) so the storefront applies the right B2B
    catalog/price. **[verify multipass/customer-account API availability on your plan.]**
  - **WooCommerce:** your app provisions/updates the WP user + role (`wholesale`), and shares a
    session (headless WP auth / JWT) so login state carries across. **[verify]**
- **Entitlement stays authoritative in your app.** The store tag/role is a *projection* of your
  `access_grants` (so the platform's checkout charges correctly); your app's DB is where the grant
  is decided and revoked. Sync direction: **your app → store**, driven by the same webhook that
  updates grants.

---

## 5. Security

Adult-customer data + money + entitlements is a high-stakes combination. Prioritized:

### 5.1 Entitlement bypass / IDOR — the #1 membership vulnerability

- **The classic bug:** the server serves "member content/price/order" using an **id taken from the
  request** (`/api/orders/1042`, `?member_id=…`) instead of the **authenticated session's** id. An
  attacker increments the id and reads someone else's data, or hits an API route that skips the
  page-level guard. This is the most common and most damaging membership flaw.
- **Fixes (layer them):**
  - **Always derive the subject from the session, never from client input.** Ownership filter =
    `WHERE member_id = session.member_id`. If a URL id doesn't match the session's grants, 404/403.
  - **Enforce entitlement in the data layer / RLS**, not only in the page or middleware — so a
    direct API call can't bypass the UI guard. (This is the concrete reason §2.3 leans Postgres+RLS;
    on MongoDB you must hand-build the enforced filter on *every* query.)
  - **Deny by default.** New routes/fields are gated unless explicitly opened. No "temporarily
    open" endpoints.
  - **Never render gated data then hide it** — omit it server-side (ties back to §2.1 SSR gating).
  - **Test it:** automated tests that log in as user A and try to read user B's grant/order/price and
    assert 403/empty.

### 5.2 Sensitive adult-customer data privacy

- **Data minimization:** sexual-preference / purchase data is highly sensitive. Collect the least you
  need; avoid storing anything you don't use.
- **Don't leak via analytics/ads/retargeting:** never pass product-level adult purchase data to
  third-party pixels; don't build audiences that could "out" a customer. (Also ties to the store
  plan's marketing constraints.)
- **Encrypt at rest and in transit;** restrict who/what can query PII; separate PII from analytics
  where feasible.
- **Clear privacy policy + honor GDPR/CCPA-style rights** (access/delete). Support hard-delete.
- **Discreet by design:** neutral billing descriptor (set at the gateway) and plain-language emails —
  a privacy *and* chargeback measure.

### 5.3 Session security

- Let the **auth vendor** own sessions where possible (Clerk/Supabase/Auth0) — they handle rotation,
  MFA, breach response better than hand-rolled NextAuth for sensitive PII.
- **HttpOnly, Secure, SameSite cookies;** short-lived access tokens + rotating refresh; **MFA at
  least for wholesale/admin** accounts (they touch pricing and other people's data).
- **Re-check entitlement server-side on every gated request** — a stale token must not grant access
  after revoke; that's why the app reads `access_grants` live, not just the JWT claim.

### 5.4 PCI scope — offload it

- **Keep card data entirely off your servers.** Checkout and the recurring charge run through the
  **store platform + high-risk gateway** (or the gateway's hosted/tokenized fields). Your app stores
  a **provider subscription id and status**, never a PAN.
- This keeps you in the lightest PCI tier (SAQ-A-ish, gateway-hosted) — **[verify with your
  gateway/QSA]** — instead of taking on full PCI scope by touching cards. Rebuilding checkout
  yourself (pattern C) would blow this up; another reason to let Shopify/Woo own the money path.

---

## 6. Phased roadmap — highest-risk unknown FIRST

**Guiding principle (same as the store plan): validate that you can get paid — recurring, for this
vertical — BEFORE writing much code. Sequence de-risks, not builds.**

**Phase A — Confirm a high-risk processor will do RECURRING adult billing.** *(Do first. Blocks
everything.)*
- Entity + EIN + resale permit already in hand (from store plan Phase 0).
- Write a one-paragraph description of the **membership** and how the recurring charge is framed
  (and whether it's separable-non-adult or clearly adult — §2.4).
- Get **written** answers from 2–3 high-risk providers (CCBill, Segpay, and/or your MSP+NMI stack):
  *Do you support **recurring** billing for this? At what fees/reserve? Does it integrate with my
  platform/app? Physical-goods context OK?* **[verify all]**
- **Decide the billing model:** one high-risk processor for both charges (default), separable
  non-adult membership fee (only if genuinely standalone), or **no recurring fee — approval-gated
  wholesale** (§2.4 option 3, recommended for launch).
- **Gate:** if no one will do recurring adult billing at workable terms → launch with
  approval-gated wholesale (no recurring), and revisit paid membership later. **Do not build a
  billing-dependent portal until this is answered.**

**Phase B — Auth + entitlement skeleton.**
- Stand up Next.js + chosen auth (Clerk/Supabase). Model **tiers as roles/claims**.
- Build the **schema** (§2.3) and the **server-side `canAccess` check** (§3) — with RLS if Postgres.
- Prove gating with a hardcoded grant: a `retail` user cannot see, over the API, what a `wholesale`
  user sees. Write the **IDOR tests** (§5.1) now, before real data exists.

**Phase C — Billing + webhook → entitlement.** *(Only if Phase A produced a recurring path.)*
- Integrate the chosen gateway's recurring/subscription API.
- Build the **signed, idempotent webhook** that mirrors `subscriptions` and **recomputes
  `access_grants`** (§3). Add the **nightly reconcile** poll and the **instant-revoke** path.
- Test the full lifecycle: subscribe → active grant → card decline → grace → revoke → resubscribe.
  *(If you launched approval-gated with no recurring, this phase becomes "approval workflow →
  grant," which is simpler.)*

**Phase D — Member portal + gated pricing.**
- Build the member area and the **wholesale application/approval workflow** (resale cert → approve →
  `wholesale` tier + grant + tax-exempt).
- Implement **server-computed per-tier pricing**; confirm the retail HTML never contains wholesale
  prices (MAP posture). **[verify each brand's MAP policy wording.]**

**Phase E — Store integration.**
- Wire the headless link to Shopify/Woo (pattern B): read catalog via API, **SSO** identity, project
  the `wholesale`/`member` role onto the store so **checkout charges the entitled price**, and route
  the money through the high-risk gateway. Keep checkout/PCI on the platform.

**Phase F — Launch.**
- Age gate, discreet descriptor, privacy policy, delete flow, MFA on wholesale/admin.
- Load-test the gating path (no per-user gated response cached at a shared edge).
- Soft launch to a few wholesale accounts; watch the webhook/reconcile logs and `entitlement_events`.

### Top 5 things to validate BEFORE writing much code

1. **Will a high-risk processor do *recurring* billing for this membership, at workable
   fees/reserves, integrated with your platform?** (Existential — Phase A.) If not, are you willing
   to launch **approval-gated wholesale with no recurring fee**? **[verify]**
2. **If you plan to frame the membership fee as "non-adult" through a mainstream biller — is it a
   genuinely separable, standalone non-adult product, or a thin wrapper over adult sales?** Get the
   processor's written OK; reframing an adult charge gets accounts frozen. **[verify]**
3. **Postgres+RLS vs MongoDB for the entitlement core** — decide up front; it dictates whether the
   engine or *your code* enforces "no one reads another member's grant." (Leaning Postgres+RLS for
   the IDOR backstop.)
4. **Does your host's current AUP actually permit your lawful-adult content?** (Vercel/Netlify are
   discretionary; lean Fly/Railway.) Confirm before you deploy. **[verify]**
5. **How does members-only wholesale pricing map to the store's checkout — can Shopify/Woo enforce
   the entitled price at checkout (B2B catalog / role), and does each brand's MAP policy permit your
   public-vs-login price split?** **[verify per brand + per platform]**

---

## Sources (all policy/AUP/tool claims require re-verification; version-sensitive)
- Stripe — [Prohibited & Restricted Businesses](https://stripe.com/legal/restricted-businesses);
  [Does Stripe Allow Adult Content? 2026 (Signature Payments)](https://signaturepayments.com/does-stripe-allow-adult-content/);
  [DirectPayNet: Stripe restricted list 2026](https://directpaynet.com/business-restricted-from-using-stripe/)
- Paddle — [What am I not allowed to sell (AUP)](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle)
- Lemon Squeezy — [Prohibited Products](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products);
  [Merchant of Record](https://docs.lemonsqueezy.com/help/payments/merchant-of-record)
- Hosting AUPs — [Vercel AUP](https://vercel.com/legal/acceptable-use-policy);
  [Netlify AUP](https://www.netlify.com/legal/acceptable-use-policy/) (discretionary "objectionable" clause)
- Adult high-risk recurring processors (from store-build plan) — CCBill, Segpay, Verotel; MSP+NMI/Authorize.net
- Companion: [`adult-ecommerce-store-build-plan.md`](./adult-ecommerce-store-build-plan.md);
  skills: `members-only-and-wholesale-pricing`, `adult-ecommerce-operations`,
  `squarespace-commerce-and-payments`, `adult-product-distribution-and-dropship-sourcing`
</content>
</invoke>
