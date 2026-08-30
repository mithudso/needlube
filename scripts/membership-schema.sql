-- Needlube membership/entitlement core (design plan §4).
-- Lives in schema "membership" alongside Medusa's tables in the same DB.
-- Medusa customer id is stored in members.auth_user_id.

CREATE SCHEMA IF NOT EXISTS membership;
SET search_path TO membership;

CREATE TABLE IF NOT EXISTS members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     text UNIQUE NOT NULL,          -- Medusa customer id (cus_...)
  email            text UNIQUE NOT NULL,
  tier             text NOT NULL DEFAULT 'retail'
                     CHECK (tier IN ('retail','member')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id            uuid NOT NULL REFERENCES members(id),
  provider             text NOT NULL,             -- 'nmi' | 'ccbill' | 'segpay' | 'manual'
  provider_sub_id      text NOT NULL,
  plan_code            text NOT NULL,
  status               text NOT NULL
                         CHECK (status IN ('active','past_due','canceled','expired','trialing')),
  current_period_end   timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub_id)
);

CREATE TABLE IF NOT EXISTS access_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES members(id),
  entitlement  text NOT NULL,                     -- 'member_pricing' | ...
  source       text NOT NULL,                     -- 'subscription:<id>' | 'manual' | 'comp'
  granted_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  UNIQUE (member_id, entitlement)
);

CREATE TABLE IF NOT EXISTS entitlement_events (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid,
  event     text NOT NULL,
  detail    jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_skus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     text NOT NULL,                   -- Medusa variant id
  supplier       text NOT NULL,                   -- 'std_xr' | 'honeys' | ...
  supplier_sku   text NOT NULL,
  cost           numeric(10,2),                   -- unknown until real feed
  map_price      numeric(10,2),
  msrp           numeric(10,2),
  listed_price   numeric(10,2),                   -- price observed on STD site (clone)
  qty_on_hand    int NOT NULL DEFAULT 0,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier, supplier_sku)
);

CREATE TABLE IF NOT EXISTS dropship_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          text NOT NULL,                -- Medusa order id
  supplier          text NOT NULL,
  supplier_order_id text,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','placed','shipped','delivered','failed','cancelled')),
  tracking_number   text,
  tracking_carrier  text,
  attempts          int NOT NULL DEFAULT 0,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed_sync_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier     text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  skus_seen    int,
  skus_updated int,
  skus_zeroed  int,
  errors       jsonb
);

CREATE TABLE IF NOT EXISTS member_savings (
  member_id  uuid REFERENCES members(id),
  order_id   text NOT NULL,
  msrp_total numeric(10,2),
  paid_total numeric(10,2),
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS age_checks (
  member_id     uuid REFERENCES members(id),
  provider      text NOT NULL,
  result        text NOT NULL,
  method        text NOT NULL CHECK (method IN ('id_scan','estimation','self_attest')),
  state_context text,
  checked_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grants_member ON access_grants (member_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_status ON dropship_jobs (status) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_supplier_skus_variant ON supplier_skus (variant_id);
