/**
 * Capture an approved PayPal order and grant membership.
 * Body: { order_id } → { granted, months }.
 * Safety: grant derives ONLY from PayPal's capture response (COMPLETED) and
 * the custom_id/amount WE set at order creation — client supplies nothing but
 * the order id, and capture fails server-side unless the payer approved.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { forwardToBilling, planByCode } from "../../../../lib/membership";
import { paypalApi, paypalEnabled, paypalEnv } from "../../../../lib/paypal";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!paypalEnabled()) {
    return res.status(503).json({ error: "paypal membership disabled" });
  }
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const orderId = String((req.body as any)?.order_id ?? "");
  if (!/^[A-Z0-9]{5,32}$/i.test(orderId)) {
    return res.status(400).json({ error: "order_id required" });
  }

  const { ok, status, data } = await paypalApi(
    `/v2/checkout/orders/${orderId}/capture`,
    { method: "POST", body: {} }
  );
  // ORDER_ALREADY_CAPTURED → treat as success path via order lookup (idempotent UX)
  let order = data;
  if (!ok && data?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
    const again = await paypalApi(`/v2/checkout/orders/${orderId}`);
    if (!again.ok) return res.status(502).json({ error: "paypal lookup failed" });
    order = again.data;
  } else if (!ok) {
    return res.status(502).json({ error: "paypal capture failed", status, detail: data });
  }

  const pu = order?.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  if (order?.status !== "COMPLETED" || cap?.status !== "COMPLETED") {
    return res.status(402).json({ error: "payment not completed", state: order?.status });
  }

  const [email, planCode, monthsStr] = String(
    cap?.custom_id ?? pu?.custom_id ?? ""
  ).split("|");
  const plan = planByCode(planCode ?? "");
  const paid = parseFloat(cap?.amount?.value ?? "0");
  if (!email || !plan || Math.abs(paid - plan.usd) > 0.001) {
    logger.warn(`paypal capture ${orderId}: custom_id/amount mismatch (${cap?.custom_id}, ${paid})`);
    return res.status(409).json({ error: "order metadata mismatch — contact support" });
  }

  const fwd = await forwardToBilling({
    eventId: `paypal:${paypalEnv()}:${cap.id}`,
    provider: "paypal",
    email,
    planCode: plan.code,
    months: parseInt(monthsStr, 10) || plan.months,
  });
  logger.info(`paypal capture ${orderId}: granted ${plan.code} to ${email} (billing ${fwd.status})`);
  return res.json({ granted: fwd.status === 200, months: plan.months, plan: plan.code });
}
