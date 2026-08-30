/**
 * Create a BTCPay invoice for a membership plan (Greenfield API).
 * Body: { email, plan_code } → { checkout_url }.
 * Needs BTCPAY_URL (default http://localhost:23000), BTCPAY_STORE_ID,
 * BTCPAY_API_KEY (Greenfield key with invoice-create permission).
 * Settlement lands via /webhooks/btcpay → /webhooks/billing.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { planByCode } from "../../../../lib/membership";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const base = process.env.BTCPAY_URL ?? "http://localhost:23000";
  const storeId = process.env.BTCPAY_STORE_ID;
  const apiKey = process.env.BTCPAY_API_KEY;
  if (!storeId || !apiKey) {
    return res.status(503).json({ error: "btcpay not configured" });
  }

  const { email, plan_code } = (req.body ?? {}) as Record<string, string>;
  const plan = planByCode(String(plan_code ?? ""));
  if (!plan || !EMAIL_RE.test(String(email ?? ""))) {
    return res.status(400).json({ error: "valid email and plan_code required" });
  }

  const resp = await fetch(`${base}/api/v1/stores/${storeId}/invoices`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `token ${apiKey}`,
    },
    body: JSON.stringify({
      amount: plan.usd.toFixed(2),
      currency: "USD",
      metadata: {
        email: String(email).toLowerCase(),
        plan_code: plan.code,
        months: plan.months,
        buyerEmail: String(email).toLowerCase(),
        itemDesc: `morelube membership — ${plan.label}`,
      },
      checkout: {
        redirectURL: `${process.env.MEMBERSHIP_BASE_URL ?? "https://morelube.com"}/us/membership/result?rail=btcpay`,
      },
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, any>;
  if (!resp.ok) {
    return res.status(502).json({ error: "btcpay invoice failed", detail: data });
  }
  return res.json({ checkout_url: data.checkoutLink, invoice_id: data.id });
}
