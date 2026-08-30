# Needlube — Server Operations (192.168.4.75)

Deployed per `needlube-design-plan.md`. Everything lives under `/opt/needlube` on the NUC
(Ubuntu 26.04, hostname `mithudso-NUC15`).

## What's running

| Component | How | Where |
|---|---|---|
| Postgres 16 | docker compose (`needlube-postgres-1`) | 127.0.0.1:5432, data in `/opt/needlube/data/postgres` |
| Redis 7 | docker compose | 127.0.0.1:6379 |
| Medusa v2.19 backend (production build) | systemd `needlube-medusa.service` | :9000 — admin UI at `http://192.168.4.75:9000/app` |
| Next.js storefront (production build) | systemd `needlube-storefront.service` | :8000 |
| Caddy reverse proxy | docker compose (host network) | :80 → storefront |
| Uptime Kuma | docker compose | `http://192.168.4.75:3001` (set up admin on first visit) |
| Nightly DB backup | `/etc/cron.d/needlube-backup` 03:15 | gzip dumps in `/opt/needlube/backups`, 14 kept |

## URLs

- Storefront: `http://192.168.4.75/` (region path `/us`)
- Admin: `http://192.168.4.75:9000/app` — credentials in `/opt/needlube/secrets/admin-credentials` (on the server)
- Monitoring: `http://192.168.4.75:3001`

## Data seeded

- 3,208 products from the full scrape (`/opt/needlube/catalog/catalog.json`), 119 brand
  collections, **302 categories**, US region (usd), all published to the Default Sales Channel.
- **Real pricing** (from the scrape): public price = `price_msrp` ("Recommended Retail");
  member price = `price_wholesale` (STD near-wholesale), via price list **"Member pricing"**
  gated to customer group **"Members"**. UPC/manufacturer/msrp/wholesale in product metadata.
- **Images self-hosted:** 36,441 files (14 GB) in `/opt/needlube/static/catalog`, served by
  Caddy at `/catalog-images/*`. Product image URLs are absolute
  `http://192.168.4.75/catalog-images/...` — when the real domain lands, bulk-rewrite with:
  `UPDATE image SET url = replace(url, 'http://192.168.4.75', 'https://yourdomain');`
  then restart backend + rebuild storefront.
- Membership schema in Postgres schema `membership` (members, subscriptions, access_grants,
  entitlement_events, supplier_skus, dropship_jobs, feed_sync_runs, member_savings, age_checks).

## Entitlement wiring (live)

- `POST /webhooks/billing` on the backend — provider-agnostic billing webhook.
  HMAC-SHA256 signature in `X-Needlube-Signature`, secret = `BILLING_WEBHOOK_SECRET` in
  `/opt/needlube/.env` (mirrored into the backend env). Idempotent by `event_id`.
  Active/trialing/past_due → grants `member_pricing` + adds Medusa customer to "Members"
  group (member prices activate automatically); canceled/expired → revokes + removes.
- `order.placed` subscriber → inserts a `membership.dropship_jobs` row per supplier.
  The worker that places real distributor orders is **pending distributor API credentials**.

## Making a member manually (until a gateway is wired)

Admin UI → Customers → pick customer → add to group "Members". Or simulate the webhook:

```bash
cd /opt/needlube && set -a && . ./.env && set +a
BODY='{"event_id":"manual-1","provider":"manual","provider_sub_id":"manual-1","plan_code":"member-monthly","status":"active","current_period_end":"2027-01-01T00:00:00Z","email":"someone@example.com"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$BILLING_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -s -X POST http://localhost:9000/webhooks/billing -H "content-type: application/json" -H "x-needlube-signature: $SIG" -d "$BODY"
```

## Common ops

```bash
systemctl status needlube-medusa needlube-storefront   # app services
journalctl -u needlube-medusa -f                        # backend logs
cd /opt/needlube && docker compose ps                   # infra
/opt/needlube/scripts/backup.sh                         # manual backup
```

**Redeploy backend after code changes** (`store/apps/backend/src`):

```bash
cd /opt/needlube/store/apps/backend
npx medusa build
cp .env .medusa/server/.env
cd .medusa/server && npm install --omit=dev
systemctl restart needlube-medusa
```

**Redeploy storefront:** `cd /opt/needlube/store/apps/storefront && npm run build && systemctl restart needlube-storefront`

## Not yet wired (blocked on external vendors — design plan §5/§8 gates)

1. **Payment gateway** (NMI/CCBill/Segpay): checkout currently uses Medusa's system/manual
   provider — orders can be placed without real payment. Do NOT expose publicly until wired.
   **Squarespace is not an option for this** — its API is store-data-only (no external
   checkout), and its processors (Stripe-family/PayPal) restrict adult catalogs; see
   `adult-ecommerce-store-build-plan.md` §1. Squarespace = brand/content microsite at most.
2. **Distributor feed + order placement** (STD/XR account): feed-sync + dropship workers
   pending credentials; `dropship_jobs` rows queue up meanwhile.
3. **Cloudflare Tunnel / domain / public TLS** — LAN-only today, by design until 1–2 exist.
4. **Age verification provider** — storefront has no ID-grade gate yet; required before
   public launch in covered states.
5. **Adult-friendly ESP** — no transactional email provider configured.

## Security notes

- Secrets: `/opt/needlube/.env` (0600) + `/opt/needlube/secrets/`. JWT/cookie secrets are
  random 64-hex; admin password random.
- Postgres/Redis bound to localhost only. Site reachable on LAN only (no port-forward).
- TODO before internet exposure: Cloudflare Tunnel, disk encryption check, fail2ban/SSH
  lockdown to key-only + Tailscale, review CORS (currently allows LAN origins), real
  payment provider, age gate.
