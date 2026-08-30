/**
 * Minimal PayPal Orders v2 client (membership prepaid purchases).
 * PAYPAL_ENV=sandbox|live picks the API base. Token cached until expiry.
 *
 * LIVE MODE GUARD: keep PAYPAL_ENV=sandbox until PayPal grants written AUP
 * pre-approval for the catalog (see drafts/paypal-preapproval-request.md).
 */
const BASES = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

let cached: { token: string; exp: number } | null = null;

export const paypalEnv = () =>
  (process.env.PAYPAL_ENV === "live" ? "live" : "sandbox") as "sandbox" | "live";

export const paypalEnabled = () =>
  process.env.PAYPAL_MEMBERSHIP_ENABLED === "true" &&
  !!process.env.PAYPAL_CLIENT_ID &&
  !!process.env.PAYPAL_CLIENT_SECRET;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const resp = await fetch(`${BASES[paypalEnv()]}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`paypal token ${resp.status}`);
  const d = (await resp.json()) as { access_token: string; expires_in: number };
  cached = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cached.token;
}

export async function paypalApi(
  path: string,
  init: { method?: string; body?: unknown } = {}
) {
  const resp = await fetch(`${BASES[paypalEnv()]}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${await token()}`,
      "content-type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}
