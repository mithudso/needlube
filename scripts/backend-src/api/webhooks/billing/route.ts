/**
 * Provider-agnostic billing webhook → entitlement sync (design plan §3, §6 job 6).
 *
 * The future high-risk gateway adapter (NMI silent-post / CCBill postback)
 * translates its native callback into this canonical JSON and signs it:
 *
 *   POST /webhooks/billing
 *   X-Needlube-Signature: hex(hmac_sha256(BILLING_WEBHOOK_SECRET, rawBody))
 *   {
 *     "event_id":  "unique-per-event",
 *     "provider":  "nmi" | "ccbill" | "segpay" | "manual",
 *     "provider_sub_id": "...",
 *     "plan_code": "member-monthly",
 *     "status":    "active" | "past_due" | "canceled" | "expired" | "trialing",
 *     "current_period_end": "2026-09-30T00:00:00Z",
 *     "email":     "customer@example.com"
 *   }
 *
 * Effects (all idempotent):
 *   - upsert membership.members / membership.subscriptions
 *   - recompute membership.access_grants ('member_pricing')
 *   - add/remove the Medusa customer to/from the "Members" customer group
 *     (which activates the member price list on the storefront)
 *   - append membership.entitlement_events
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createHmac, timingSafeEqual } from "crypto";

const GRANT = "member_pricing";
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]); // past_due = grace

export const AUTHENTICATE = false;

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "billing webhook not configured" });
  }

  const raw =
    (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const given = String(req.headers["x-needlube-signature"] ?? "");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "bad signature" });
  }

  const p = req.body as Record<string, any>;
  for (const f of ["event_id", "provider", "provider_sub_id", "status", "email"]) {
    if (!p?.[f]) return res.status(400).json({ error: `missing ${f}` });
  }

  const container = req.scope;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  );

  // idempotency: event ledger
  const dup = await pgConnection.raw(
    `insert into membership.entitlement_events (event, detail)
     select 'webhook', ?::jsonb
     where not exists (
       select 1 from membership.entitlement_events
       where event = 'webhook' and detail->>'event_id' = ?
     ) returning id`,
    [JSON.stringify(p), p.event_id]
  );
  if (!dup.rows.length) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const customerModule = container.resolve(Modules.CUSTOMER);
  const email = String(p.email).toLowerCase();

  // member row (customer may not exist in Medusa yet — store email regardless)
  const [customer] = await customerModule.listCustomers({ email });
  const memberRow = await pgConnection.raw(
    `insert into membership.members (auth_user_id, email, tier)
     values (?, ?, 'retail')
     on conflict (email) do update set auth_user_id = excluded.auth_user_id
     returning id`,
    [customer?.id ?? `pending:${email}`, email]
  );
  const memberId = memberRow.rows[0].id;

  await pgConnection.raw(
    `insert into membership.subscriptions
       (member_id, provider, provider_sub_id, plan_code, status, current_period_end, updated_at)
     values (?, ?, ?, ?, ?, ?, now())
     on conflict (provider, provider_sub_id) do update
       set status = excluded.status,
           plan_code = excluded.plan_code,
           current_period_end = excluded.current_period_end,
           updated_at = now()`,
    [
      memberId,
      p.provider,
      p.provider_sub_id,
      p.plan_code ?? "member-monthly",
      p.status,
      p.current_period_end ?? null,
    ]
  );

  const entitled = ACTIVE_STATUSES.has(p.status);
  if (entitled) {
    await pgConnection.raw(
      `insert into membership.access_grants (member_id, entitlement, source, expires_at, revoked_at)
       values (?, ?, ?, ?, null)
       on conflict (member_id, entitlement) do update
         set source = excluded.source, expires_at = excluded.expires_at,
             revoked_at = null, granted_at = now()`,
      [memberId, GRANT, `subscription:${p.provider_sub_id}`, p.current_period_end ?? null]
    );
    await pgConnection.raw(
      `update membership.members set tier = 'member' where id = ?`,
      [memberId]
    );
  } else {
    await pgConnection.raw(
      `update membership.access_grants set revoked_at = now()
       where member_id = ? and entitlement = ?`,
      [memberId, GRANT]
    );
    await pgConnection.raw(
      `update membership.members set tier = 'retail' where id = ?`,
      [memberId]
    );
  }

  // project entitlement onto Medusa customer group (drives the price list)
  if (customer) {
    const [group] = await customerModule.listCustomerGroups({ name: "Members" });
    if (group) {
      if (entitled) {
        await customerModule.addCustomerToGroup({
          customer_id: customer.id,
          customer_group_id: group.id,
        });
      } else {
        await customerModule.removeCustomerFromGroup({
          customer_id: customer.id,
          customer_group_id: group.id,
        });
      }
    }
  } else {
    logger.warn(
      `billing webhook: no Medusa customer for ${email} yet; group sync deferred`
    );
  }

  logger.info(
    `billing webhook: ${email} -> ${p.status} (entitled=${entitled})`
  );
  return res.status(200).json({ ok: true, entitled });
}
