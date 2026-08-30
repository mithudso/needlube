/**
 * BTCPay Server webhook → canonical billing webhook adapter.
 *
 * BTCPay signs webhook deliveries with HMAC-SHA256 in the `BTCPay-Sig`
 * header ("sha256=<hex>"), secret = BTCPAY_WEBHOOK_SECRET.
 *
 * Membership-in-crypto model (no card rails yet): a member buys a PREPAID
 * membership period (1/3/12 months). The BTCPay invoice is created with
 * metadata { email, plan_code, months }. On settlement this adapter
 * translates to the provider-agnostic canonical payload and forwards it to
 * /webhooks/billing (signed with BILLING_WEBHOOK_SECRET), which grants
 * `member_pricing` with expires_at = now + months. No auto-renew — a
 * renewal-reminder job emails before expiry; entitlement lapses via
 * expires_at if not renewed (expiry is data, not a cron).
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createHmac, timingSafeEqual } from "crypto";

export const AUTHENTICATE = false;

// events that settle money; everything else is acknowledged and ignored
const SETTLED = new Set(["InvoiceSettled", "InvoicePaymentSettled"]);

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const btcpaySecret = process.env.BTCPAY_WEBHOOK_SECRET;
  const billingSecret = process.env.BILLING_WEBHOOK_SECRET;
  if (!btcpaySecret || !billingSecret) {
    return res.status(503).json({ error: "btcpay webhook not configured" });
  }

  const raw =
    (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const given = String(req.headers["btcpay-sig"] ?? "");
  const expected =
    "sha256=" + createHmac("sha256", btcpaySecret).update(raw).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "bad signature" });
  }

  const ev = req.body as Record<string, any>;
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  if (!SETTLED.has(ev?.type)) {
    return res.status(200).json({ ok: true, ignored: ev?.type });
  }

  const meta = ev.metadata ?? {};
  const email = meta.email ?? ev.buyerEmail;
  const months = parseInt(String(meta.months ?? "1"), 10) || 1;
  if (!email) {
    logger.warn(`btcpay webhook: settled invoice ${ev.invoiceId} without email metadata`);
    return res.status(200).json({ ok: true, skipped: "no email" });
  }

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + months);

  const canonical = JSON.stringify({
    event_id: `btcpay:${ev.invoiceId}:${ev.type}`,
    provider: "btcpay",
    provider_sub_id: `btcpay:${email}`, // one logical "subscription" per member
    plan_code: meta.plan_code ?? `member-${months}mo-crypto`,
    status: "active",
    current_period_end: periodEnd.toISOString(),
    email,
  });
  const sig = createHmac("sha256", billingSecret).update(canonical).digest("hex");

  const resp = await fetch("http://localhost:9000/webhooks/billing", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-needlube-signature": sig,
    },
    body: canonical,
  });
  const out = await resp.json().catch(() => ({}));
  logger.info(
    `btcpay webhook: invoice ${ev.invoiceId} -> billing ${resp.status} (${email}, ${months}mo)`
  );
  return res.status(200).json({ ok: true, forwarded: resp.status, result: out });
}
