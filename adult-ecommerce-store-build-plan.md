# Adult / Sexual-Wellness Ecommerce Store — Build Plan

**Business model:** Online retail of legal adult toys / sexual-wellness products, sourced via
dropship + distribution, sold with members-only (wholesale / tiered) pricing.
**Platform under consideration:** Squarespace.
**Audience for this doc:** the founder (you), making build-vs-platform decisions.

> **Scope & honesty note.** This is retail/ecommerce planning guidance for a **lawful** business.
> Every payment-policy, fee, and vendor claim below is marked **[verify]** — processor terms,
> distributor programs, and state age-verification laws change constantly and are underwriting-
> and catalog-specific. Nothing here guarantees any processor will approve *your* specific
> catalog. Confirm each item in writing with the vendor before you spend money or commit a
> platform. Research current as of ~Jan 2026; doc drafted Aug 2026.

---

## 1. The central decision: can this run on Squarespace?

### Short verdict (one line)
**Squarespace can host the brand and content, but it cannot be the transactional core of this
business: its checkout settles only through processors that restrict/reject adult toys, and its
Member Areas cannot do login-to-see wholesale/tiered pricing — so plan to build on Shopify (or
WooCommerce) with a high-risk gateway.** [verify]

### Where Squarespace *works*
- **Brand, content, editorial, SEO, blog, email capture.** Squarespace's design system is strong;
  it's a fine marketing site / content layer.
- **Simple retail — only if the processor accepts your exact catalog.** Squarespace Commerce
  settles through **Stripe and PayPal** (and its own **Squarespace Payments**, which is
  **Stripe-powered** underneath), plus Square in some contexts. [verify] A tasteful "sexual
  wellness" catalog (lubricants, massagers marketed as wellness, books, apparel) *might* clear
  Stripe's review — but this is a case-by-case underwriting call, not a guarantee.

### Where Squarespace *fails* (the two hard blockers)
1. **Payments reject the category.** Stripe's Restricted/Prohibited Businesses list **prohibits**
   adult *services* and sexually explicit *content*, and treats **sex toys / adult products as
   "restricted"** — a gray zone that underwriting banks routinely **decline up front or shut down
   later** because card networks classify the whole vertical as high-risk. [verify] There is **no
   way to bolt a dedicated high-risk gateway (CCBill, Segpay, an NMI/Authorize.net high-risk
   account, etc.) onto Squarespace checkout** — you're limited to Squarespace's supported
   processors. If Stripe says no (or later freezes funds), the store cannot take money. This is the
   **#1 existential risk** and it is a Squarespace architecture limit, not a settings toggle.
2. **No real members-only / wholesale pricing.** Squarespace **Member Areas gate *content*, not
   *prices*.** There is **no native B2B/wholesale, no "log in to see wholesale price," no per-
   customer-group price tiers**; each "tier" is a separate member area, and pricing doesn't change
   by login. [verify] So the core "members-only / tiered pricing" requirement is **not achievable
   natively** on Squarespace.

### The realistic alternatives (recommended)

| Option | Payments | Wholesale/tiered pricing | Verdict |
|---|---|---|---|
| **Squarespace** | Stripe/PayPal/Square only — adult toys restricted; no high-risk gateway option | Member Areas gate content, not price; no B2B tiers | Brand/content layer only. **Not the store.** |
| **Shopify** *(recommended)* | **Shopify Payments prohibited for adult** → must use a **third-party high-risk gateway** (higher fees), but Shopify *permits* adult toys with age gate + content rules | **Native B2B** (quantity price breaks / company catalogs) on all plans; deep wholesale apps (Wholesale Club, B2B/Wholesale Solution, Wholesale Pricing Discount) | **Best balance** of ecosystem, apps, and gateway flexibility |
| **WooCommerce (self-hosted)** | Full freedom to integrate any high-risk gateway (NMI, Authorize.net + high-risk acquirer, or an MSP) | **Role-based pricing** plugins (Wholesale Suite, ELEX, B2BKing) give login-gated tiers | **Max control**, max maintenance/PCI/hosting burden |

### Recommendation & tradeoffs
- **Recommendation: build the store on Shopify + a high-risk payment gateway + a B2B/wholesale
  app.** Use Squarespace (if you already like it) *only* as an optional content/brand microsite,
  or skip it and run everything on Shopify.
- **Why Shopify over Woo:** native B2B tiers + huge app ecosystem for distributor feed sync and
  wholesale gating, far less operational burden than self-hosting; you can attach a compliant
  high-risk gateway. **Tradeoff:** you *cannot* use Shopify Payments for this catalog, so you pay
  higher third-party gateway fees and take on gateway integration. [verify]
- **Choose WooCommerce instead if** you want total control of checkout/pricing logic and are
  willing to own hosting, security patching, PCI scope, and plugin maintenance. **Tradeoff:** more
  DIY, more things that can break.
- **Do NOT** architect the transactional store on Squarespace. Reserve it for brand/content.

---

## 2. Payment processing shortlist  *(policy-sensitive — [verify] all)*

The single most important pre-spend validation. Two worlds:

### Mainstream aggregators — mostly a dead end for this catalog
| Processor | Reality for adult toys |
|---|---|
| **Stripe** | Adult *services*/explicit content **prohibited**; sex toys **"restricted"** — frequently declined or later frozen. Powers Squarespace Payments + Squarespace/Shopify-adjacent checkouts. **Assume no** for an explicit catalog. [verify] |
| **Square** | Similar adult restrictions; not a reliable fit. [verify] |
| **PayPal** | Restricts "sexually oriented" goods; risk of holds/limits. [verify] |
| **Shopify Payments** | **Prohibited for adult**, even though Shopify the platform permits adult toys. Forces a third-party gateway. [verify] |

**Implication:** mainstream processors may tolerate a narrowly-framed "wellness" catalog but are
unreliable for anything explicit. Do not build core revenue on them for this vertical.

### High-risk processors / gateways — the real path
Two sub-types matter, and they are **not interchangeable**:

- **Adult content/subscription specialists** — **CCBill, Segpay, Verotel, Epoch, NetBilling.**
  Excellent at *digital* adult content, memberships, recurring billing, discreet descriptors,
  chargeback tooling. Some support physical goods, but they're **content-first**; confirm they
  support **physical product retail + your cart/platform** before assuming. [verify]
- **High-risk merchant accounts for *physical* adult retail** — obtained via an **MSP/ISO**
  (e.g., **PayKings, Corepay, DirectPayNet, Instabill, MobiusPay**) that places you with a
  high-risk **acquiring bank**, paired with a **gateway** (**NMI** or **Authorize.net**). This is
  the typical stack for an adult-toy *store* on Shopify/Woo. [verify]

**Fees & reserves reality (expect, [verify] exact numbers):**
- Higher discount rate than mainstream (often materially above the ~2.9%+ retail norm). [verify]
- **Rolling reserve** (a % of sales held for months) and/or higher per-transaction fees. [verify]
- Setup/underwriting steps, possible monthly minimums, chargeback fees. [verify]
- **Never quote yourself a specific rate from this doc — get written quotes.**

### Which pairs with which platform
| Platform | Compatible high-risk options |
|---|---|
| **Shopify** | Third-party gateways approved for Shopify + adult: NMI-based / Authorize.net-based high-risk accounts via an MSP; some adult-focused providers publish Shopify integrations. **Confirm the specific provider supports Shopify's checkout + adult toys.** [verify] |
| **WooCommerce** | Broadest: NMI, Authorize.net, CCBill/Segpay/Verotel plugins, or any MSP-provided gateway. [verify] |
| **Squarespace** | **None** beyond Stripe/PayPal/Square — cannot attach a high-risk gateway. [verify] |

**Action:** get **2–3 written pre-approvals** for your *actual* catalog *before* committing a
platform or paying for a build.

---

## 3. Sourcing shortlist — adult dropship / wholesale distributors  *(vendor-sensitive — [verify] all)*

US distributors that offer **data feeds** (inventory + images + pricing) and dropship/blind-ship:

| Distributor | Notes ([verify]) |
|---|---|
| **Honey's Place** | Woman-founded; ~25 yrs; CA warehouse; **documented API + hourly inventory feed**; blind dropship. Strong feed reputation. |
| **Nalpac / Entrenue** | Publishes **MAP + MSRP in the data feed**; **syncs to Shopify, WooCommerce, Magento, BigCommerce**. (Nalpac acquired Entrenue.) |
| **Eldorado Trading Company** | Large, long-established adult-novelty distributor; data feed + dropship program. |
| **Williams Trading Co.** | Established distributor; carries brands **XGEN, XR Brands, SHOTS**; feed + dropship + training academy. |
| **SHOTS / XGEN** | Primarily **brands/wholesalers** (often *accessed through* distributors like Williams Trading) rather than pure dropship feeds — confirm direct-account terms. |

**Account requirements (typical, [verify]):** business entity + EIN, **state resale/seller's
permit (resale certificate)**, sometimes proof of a live storefront or minimum order, signed
dropship agreement. Blind-ship / discreet packaging is usually available — **confirm per vendor.**

**MAP implications:** many distributors/brands enforce **Minimum Advertised Price**. MAP limits the
*advertised/public* price you may show — which directly shapes what your **public vs member
(logged-in) prices** can be (see §4). Get each vendor's MAP policy in writing.

**Integration tooling:** if a distributor lacks a native app for your platform, middleware like
**Spark Shipping** or **Inventory Source** can map feeds → Shopify/Woo (stock sync + auto-order).
[verify]

---

## 4. Members-only / wholesale (tiered) pricing — how to actually build it

**Requirement:** different prices by customer group / login (retail vs member/wholesale tiers),
i.e., "log in to see your price."

| Platform | How it's done | Fit |
|---|---|---|
| **Shopify** *(recommended)* | Native **B2B**: **company profiles + catalogs + quantity price breaks** (all plans). For login-gated member pricing, add a **wholesale app** (Wholesale Club, B2B/Wholesale Solution by BSS, Wholesale Pricing Discount, SparkLayer). Gate the wholesale catalog behind approved accounts. | **Strong** |
| **WooCommerce** | **Role-based pricing** via WordPress user roles — plugins: **Wholesale Suite, ELEX Role-Based Pricing, B2BKing, WholesaleX**. Assign roles (retail/silver/gold/wholesale); prices change on login; can hide prices until approved. | **Strong, DIY** |
| **Squarespace** | **Cannot do it.** Member Areas gate content, not price; no per-group pricing, no login-to-see-price. Workarounds (separate hidden pages, external tools) are brittle. | **Fails the requirement** |

**How MAP constrains member pricing:**
- MAP governs the **advertised** price — generally the price a **logged-out/public** visitor sees.
- The common compliant pattern: **show MAP publicly; reveal below-MAP member/wholesale pricing
  only behind login** ("add to cart to see price" / "log in for wholesale"). Confirm this satisfies
  each brand's MAP policy — **some MAP policies also restrict logged-in display**; get it in
  writing. [verify]
- This is a concrete reason the platform must support **login-gated pricing** — which Squarespace
  does not.

---

## 5. Inventory management

**Model choice:**
- **Pure dropship (feed-driven):** distributor holds stock; you sync their feed. Lowest capital,
  lowest control, thinner margins, longer/variable ship times, and you inherit their stockouts.
- **Hold stock (buy wholesale, self-fulfill):** better margin, control, discreet-packaging
  control, faster ship — but capital tied up + storage + your own fulfillment.
- **Hybrid:** stock your top sellers; dropship the long tail. **Recommended once you know demand.**

**Feed-driven stock sync:** pull distributor inventory on a schedule (API/EDI/FTP/CSV; Honey's
Place ~hourly) so product pages reflect real availability. Use native distributor apps or
middleware (Spark Shipping / Inventory Source). [verify]

**SKUs / variants:** model color/size/set variants cleanly; keep distributor SKU + your SKU mapped
so reorders and feed updates reconcile. Multi-distributor overlap means **de-dupe** the same
product coming from two feeds.

**Out-of-stock handling:** auto-hide or mark unavailable on zero stock; consider back-in-stock
notifications; if dropshipping from multiple vendors, route each order to the vendor that has
stock.

**The shared-feed duplicate-content / SEO problem (important):** hundreds of adult stores ingest
the **same distributor descriptions and images**. Google may treat this as **duplicate content**,
suppressing your rankings. **Mitigate:**
- **Rewrite every product description** in your own brand voice (do not ship raw feed copy).
- Add **unique value**: original photography where possible, buying guides, honest reviews,
  comparisons, FAQs, use/care content.
- Unique titles/meta; internal linking; collection/category pages with original copy.
- This is where your marketing/copy skills (see §6) directly move the needle.

---

## 6. Marketing under adult restrictions

**The hard constraint:** **Google Ads and Meta (Facebook/Instagram) ads largely ban adult/sexual
products** — paid search/social at scale is mostly off the table. [verify] So growth leans on
channels that don't gate the category:

- **SEO / content (primary):** you own this. Buying guides, education, reviews, comparison pages —
  compounds over time and sidesteps ad bans. Directly ties to the duplicate-content fix in §5.
- **Email (with an adult-friendly ESP):** Klaviyo/Mailchimp and mainstream ESPs often restrict
  adult content — use an **adult-friendly ESP** (e.g., providers that explicitly allow it). [verify]
  Owned list = your most durable channel; build it from day one.
- **Affiliates / creators / adult-friendly networks:** partner with sex-positive creators,
  bloggers, review sites, and affiliate programs that accept the vertical.
- **Content & PR:** editorial, expert positioning, sexual-wellness angle, podcasts, press.
- **Adult-friendly ad networks / sponsorships** where paid makes sense (not Google/Meta).

**Ecommerce conversion psychology — apply your existing skills, don't re-derive them here:**
- **`conversion-copywriting-and-voice-of-customer`** — mine real customer language; frame the
  wellness/benefit; rewrite feed copy (also solves §5's SEO problem).
- **`applied-psychology`** — trust, decision-making, reactance-aware messaging.
- **`direct-response-and-sales-letter-copywriting`** — offers, product-page persuasion, email
  sequences.

Category-specific conversion levers to brief into those skills:
- **Trust signals:** discretion guarantees, secure-checkout badges, real reviews, body-safe /
  material education, clear returns.
- **Discreet-shipping + neutral-billing messaging** — surface it prominently; it's a top purchase
  anxiety in this category and a real conversion driver.
- **Pricing psychology:** anchoring public MAP vs member price makes the members-only tier feel
  like a genuine unlock.
- **Urgency — ethically:** real scarcity/low-stock only; avoid deceptive/dark-pattern countdowns
  (also a legal/reputational risk).

---

## 7. Compliance & operations

- **Age verification (18+):** a simple "Are you 18?" pop-up is **self-declaration, not
  verification.** **25+ US states** now have adult age-verification laws, some requiring
  **ID-grade** checks; requirements vary by what you sell and where you ship. Plan for at least a
  robust age gate, and evaluate **ID/age-estimation verification** (e.g., providers like Yoti,
  Veratad, AgeChecked, Didit) against the laws of the states you ship to. **Get current legal
  advice — this area is changing fast.** [verify]
- **Discreet packaging + neutral billing descriptor:** plain outer packaging, no explicit branding;
  a **neutral, non-explicit billing descriptor** (reduces chargebacks and honors customer privacy).
  Confirm blind-ship with each distributor; confirm descriptor with your gateway. [verify]
- **Sensitive-data / privacy:** sexual-preference purchase data is highly sensitive. Minimize data
  collected, secure it, publish a clear privacy policy; be mindful of GDPR/CCPA-type obligations
  and of state privacy laws. Don't retarget in ways that "out" customers.
- **Business formation + merchant underwriting docs:** form an entity (LLC/corp) + **EIN**; get a
  **state resale/seller's permit** (needed for distributor accounts and sales tax). Prepare the
  **high-risk underwriting packet**: entity formation docs, EIN, owner ID(s), voided check/bank
  letter, a **business plan**, projected volumes, your website URL with visible policies (age,
  privacy, returns, shipping), and **3 months of prior processing statements if you have them.**
  [verify]
- **Product/consumer-safety & tax:** body-safe material claims, honest labeling; register for
  sales tax where you have nexus.

---

## 8. Phased roadmap

**Guiding principle: validate payment acceptance FIRST. Everything else is wasted spend if you
can't get paid.**

**Phase 0 — Payment validation (do before anything else).**
- Form the entity + EIN + resale permit (needed to even apply).
- Write a 1-page catalog description (exactly what you'll sell, how explicit).
- Get **written pre-approval / quotes from 2–3 high-risk providers** (an MSP with NMI/Authorize.net
  for physical retail; optionally CCBill/Segpay/Verotel). Capture **rate, reserve, reserve term,
  chargeback terms, platform compatibility.** [verify]
- **Gate:** no viable processor → rethink the catalog framing (e.g., narrower "wellness") or the
  business, before building.

**Phase 1 — Platform choice.** With a processor in hand, pick the platform its gateway supports —
**Shopify** (default) or **WooCommerce**. Confirm the gateway integrates with that platform's
checkout for adult toys. Relegate Squarespace to brand/content if desired.

**Phase 2 — Sourcing accounts.** Open distributor accounts (Honey's Place, Nalpac/Entrenue,
Eldorado, Williams Trading). Get **data feeds + MAP policies + dropship/blind-ship terms** in
writing. Decide dropship vs stock vs hybrid.

**Phase 3 — Build.** Storefront + theme, feed integration (native app or Spark Shipping/Inventory
Source), age gate, discreet-shipping & neutral-descriptor setup, policy pages, unique product copy
(no raw feed copy).

**Phase 4 — Pricing tiers.** Implement members-only/wholesale pricing (Shopify B2B + wholesale app,
or Woo role-based pricing). Wire public-MAP-vs-member-price display in line with MAP policies.

**Phase 5 — Marketing.** SEO/content engine, adult-friendly ESP + email capture, affiliates/
creators, conversion optimization using your copy/psychology skills.

### Top 5 highest-risk unknowns to validate *before* spending money
1. **Will any processor approve *your exact* catalog, at workable fees/reserves?** (Existential —
   Phase 0.) [verify]
2. **Does that gateway integrate with your chosen platform's checkout for adult toys?** (Kills the
   platform choice if not.) [verify]
3. **Do the distributors grant *you* an account + feed + blind-ship, and what does their MAP allow
   for member vs public pricing?** [verify]
4. **Age-verification legal exposure in the states you'll ship to** — gate vs ID-grade; is it
   affordable/frictionless enough? [verify]
5. **Unit economics after high-risk fees + reserves + dropship margins + duplicate-content SEO
   drag** — is there a real margin, or does the reserve/fee stack erase it? [verify]

---

## Sources (all policy/fee/vendor claims require re-verification)
- Squarespace — [Acceptable Use Policy](https://www.squarespace.com/acceptable-use-policy),
  [What can't I sell](https://support.squarespace.com/hc/en-us/articles/360001998707-What-can-t-I-sell-on-Squarespace),
  [Payments Terms](https://www.squarespace.com/payments-terms)
- Stripe — [Prohibited & Restricted Businesses](https://stripe.com/legal/restricted-businesses);
  [Signature Payments: Does Stripe Allow Adult Content? (2026)](https://signaturepayments.com/does-stripe-allow-adult-content/);
  [PayKings: Stripe Prohibited Businesses](https://paykings.com/blog/stripe-prohibited-businesses/)
- Squarespace Member Areas / B2B limits — [MemberSpace](https://www.memberspace.com/blog/squarespace-member-sites/),
  [Sparkplugin](https://www.sparkplugin.com/blog/squarespace-membership-site)
- Shopify adult + B2B — [Swell: Shopify alternatives for adult brands](https://www.swell.is/content/adult-product-brands-shopify-alternatives);
  [Inventory Source: dropshipping adult products](https://www.inventorysource.com/dropshipping-adult-products-supplier-vetting-compliance/);
  [WholesaleHelper: Shopify tiered pricing](https://wholesalehelper.io/blog/shopify-tiered-pricing-and-discount-for-b2b/)
- High-risk processors — [Segpay high-risk](https://segpay.com/verticals/high-risk/);
  [PaymentNerds: best adult gateways 2026](https://paymentnerds.com/blog/best-payment-gateways-for-adult-websites-in-2026/);
  [MobiusPay: adult merchant account](https://mobiuspay.com/blog/how-to-get-an-adult-merchant-account)
- Distributors / feeds — [Honey's Place / Nalpac via Spark Shipping](https://www.sparkshipping.com/integrations/sex-toy-distributing);
  [Inventory Source: sex toy distribution](https://www.inventorysource.com/dropshippers/sex-toy-distribution/);
  [Williams Trading new arrivals (XGEN/XR/SHOTS)](https://jrlcharts.com/2026/01/02/williams-trading-unveils-this-weeks-hottest-new-pleasure-product-arrivals/)
- Age verification — [PaymentNerds: age-verification best practices](https://paymentnerds.com/blog/age-verification-best-practices-for-online-commerce/);
  [MobiusPay: age-verification rules 2026](https://mobiuspay.com/blog/how-to-meet-age-verification-rules-for-adult-merchants)
- WooCommerce role-based pricing — [Wholesale Suite](https://wordpress.org/plugins/woocommerce-wholesale-prices/),
  [ELEX Role-Based Pricing](https://elextensions.com/plugin/woocommerce-catalog-mode-wholesale-role-based-pricing/)
