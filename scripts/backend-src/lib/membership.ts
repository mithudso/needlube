/**
 * Membership plans + helper to forward a settled payment into the canonical
 * billing webhook (single entitlement path for every rail: btcpay, paypal, …).
 * Prices are PLACEHOLDERS — tune before launch.
 */
import { createHmac } from "crypto";

export type MembershipPlan = {
  code: string;
  months: number;
  usd: number;
  label: string;
};

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  { code: "member-1mo", months: 1, usd: 14.95, label: "Monthly" },
  { code: "member-3mo", months: 3, usd: 39.95, label: "3 months" },
  { code: "member-12mo", months: 12, usd: 129.95, label: "Annual" },
];

export const planByCode = (code: string) =>
  MEMBERSHIP_PLANS.find((p) => p.code === code);

/**
 * Forward a settled membership payment to /webhooks/billing (idempotent by
 * event_id). Grants member_pricing with expires_at = now + months.
 */
export async function forwardToBilling(opts: {
  eventId: string;
  provider: string;
  email: string;
  planCode: string;
  months: number;
}) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) throw new Error("BILLING_WEBHOOK_SECRET not set");
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + opts.months);
  const body = JSON.stringify({
    event_id: opts.eventId,
    provider: opts.provider,
    provider_sub_id: `${opts.provider}:${opts.email.toLowerCase()}`,
    plan_code: opts.planCode,
    status: "active",
    current_period_end: periodEnd.toISOString(),
    email: opts.email.toLowerCase(),
  });
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  const resp = await fetch("http://localhost:9000/webhooks/billing", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-needlube-signature": sig,
    },
    body,
  });
  return { status: resp.status, body: await resp.json().catch(() => ({})) };
}
