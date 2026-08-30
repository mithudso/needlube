/**
 * Create a PayPal order (Orders v2, one-time capture) for a membership plan.
 * Body: { email, plan_code } → { approve_url, order_id }.
 * Disabled unless PAYPAL_MEMBERSHIP_ENABLED=true. Keep PAYPAL_ENV=sandbox
 * until written AUP pre-approval (drafts/paypal-preapproval-request.md).
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { planByCode } from "../../../../lib/membership";
import { paypalApi, paypalEnabled } from "../../../../lib/paypal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!paypalEnabled()) {
    return res.status(503).json({ error: "paypal membership disabled" });
  }
  const { email, plan_code } = (req.body ?? {}) as Record<string, string>;
  const plan = planByCode(String(plan_code ?? ""));
  if (!plan || !EMAIL_RE.test(String(email ?? ""))) {
    return res.status(400).json({ error: "valid email and plan_code required" });
  }

  const base =
    process.env.MEMBERSHIP_BASE_URL ?? "https://morelube.com";
  const { ok, status, data } = await paypalApi("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: plan.usd.toFixed(2) },
          description: `morelube membership — ${plan.label}`,
          custom_id: `${String(email).toLowerCase()}|${plan.code}|${plan.months}`,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "morelube",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: `${base}/us/membership/result?rail=paypal`,
            cancel_url: `${base}/us/membership?cancelled=1`,
          },
        },
      },
    },
  });
  if (!ok) return res.status(502).json({ error: "paypal order failed", status, detail: data });
  const approve = (data.links ?? []).find(
    (l: any) => l.rel === "payer-action" || l.rel === "approve"
  )?.href;
  return res.json({ order_id: data.id, approve_url: approve });
}
