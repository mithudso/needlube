import { Metadata } from "next"
import { redirect } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Membership",
  description: "Members buy everything at near-wholesale prices.",
}

const BACKEND =
  process.env.MEDUSA_BACKEND_URL ??
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ??
  "http://localhost:9000"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""

async function getPlans() {
  const res = await fetch(`${BACKEND}/store/membership/plans`, {
    headers: { "x-publishable-api-key": PK },
    cache: "no-store",
  })
  if (!res.ok) return { plans: [], rails: { btcpay: false, paypal: false } }
  return res.json()
}

async function startCheckout(formData: FormData) {
  "use server"
  const rail = String(formData.get("rail") ?? "")
  const plan_code = String(formData.get("plan_code") ?? "")
  const email = String(formData.get("email") ?? "").toLowerCase().trim()
  const path =
    rail === "paypal" ? "paypal-order" : "btcpay-invoice"
  const res = await fetch(`${BACKEND}/store/membership/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": PK,
    },
    body: JSON.stringify({ email, plan_code }),
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  const url = data.checkout_url ?? data.approve_url
  if (!res.ok || !url) {
    redirect(`/us/membership?error=${encodeURIComponent(data.error ?? "checkout failed")}`)
  }
  redirect(url)
}

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string }>
}) {
  const params = await searchParams
  const [{ plans, rails }, customer] = await Promise.all([
    getPlans(),
    retrieveCustomer().catch(() => null),
  ])

  return (
    <div className="content-container py-12 max-w-3xl">
      <h1 className="text-3xl mb-2">Membership</h1>
      <p className="mb-1 text-ui-fg-subtle">
        Members buy everything in the store at near-wholesale prices — typically
        50–65% below retail. The membership fee is the whole business model; the
        products are sold at close to our cost.
      </p>
      <p className="mb-8 text-ui-fg-subtle text-sm">
        Prepaid access, no auto-renew. We remind you before it lapses; renew only
        if it paid for itself.
      </p>

      {params.error && (
        <p className="mb-6 text-rose-600">Checkout error: {params.error}</p>
      )}
      {params.cancelled && (
        <p className="mb-6 text-ui-fg-subtle">Checkout cancelled.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        {plans.map((p: any) => (
          <form
            action={startCheckout}
            key={p.code}
            className="border rounded-lg p-5 flex flex-col gap-3"
          >
            <input type="hidden" name="plan_code" value={p.code} />
            <div className="text-lg font-semibold">{p.label}</div>
            <div className="text-2xl">${p.usd}</div>
            <div className="text-sm text-ui-fg-subtle">
              {p.months} month{p.months > 1 ? "s" : ""} of member pricing
            </div>
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              defaultValue={customer?.email ?? ""}
              className="border rounded px-3 py-2 text-sm"
            />
            {rails.btcpay && (
              <button
                name="rail"
                value="btcpay"
                className="bg-zinc-900 text-white rounded px-3 py-2 text-sm"
              >
                Pay with Bitcoin
              </button>
            )}
            {rails.paypal && (
              <button
                name="rail"
                value="paypal"
                className="bg-[#ffc439] text-zinc-900 rounded px-3 py-2 text-sm"
              >
                PayPal{rails.paypal_env === "sandbox" ? " (sandbox)" : ""}
              </button>
            )}
            {!rails.btcpay && !rails.paypal && (
              <div className="text-sm text-rose-600">
                Payment rails not configured yet.
              </div>
            )}
          </form>
        ))}
      </div>

      <p className="mt-8 text-xs text-ui-fg-subtle">
        Membership activates automatically when payment settles (Bitcoin: after
        network confirmation, usually minutes). Log in with the same email to
        see member prices.
      </p>
    </div>
  )
}
