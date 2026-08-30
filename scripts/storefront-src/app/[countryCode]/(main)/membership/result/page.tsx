const BACKEND =
  process.env.MEDUSA_BACKEND_URL ??
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ??
  "http://localhost:9000"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""

export default async function MembershipResult({
  searchParams,
}: {
  searchParams: Promise<{ rail?: string; token?: string }>
}) {
  const params = await searchParams
  let heading = "Payment received"
  let body =
    "Your membership activates as soon as the payment settles. Log in with the email you used to see member prices."

  if (params.rail === "paypal" && params.token) {
    const res = await fetch(`${BACKEND}/store/membership/paypal-capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": PK,
      },
      body: JSON.stringify({ order_id: params.token }),
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.granted) {
      heading = "Membership active"
      body = `Your ${data.months}-month membership is live. Log in to see member prices on every product.`
    } else {
      heading = "Payment not completed"
      body = `We couldn't confirm the PayPal payment (${data.error ?? res.status}). If you were charged, contact support with your PayPal receipt.`
    }
  } else if (params.rail === "btcpay") {
    heading = "Bitcoin payment detected"
    body =
      "Membership activates automatically once the payment confirms on the network (usually within minutes). Log in with the email you used at checkout."
  }

  return (
    <div className="content-container py-16 max-w-xl">
      <h1 className="text-2xl mb-3">{heading}</h1>
      <p className="text-ui-fg-subtle">{body}</p>
    </div>
  )
}
