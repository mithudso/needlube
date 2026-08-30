import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEMBERSHIP_PLANS } from "../../../../lib/membership";
import { paypalEnabled, paypalEnv } from "../../../../lib/paypal";

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({
    plans: MEMBERSHIP_PLANS,
    rails: {
      btcpay: !!(process.env.BTCPAY_API_KEY && process.env.BTCPAY_STORE_ID),
      paypal: paypalEnabled(),
      paypal_env: paypalEnv(),
    },
  });
}
