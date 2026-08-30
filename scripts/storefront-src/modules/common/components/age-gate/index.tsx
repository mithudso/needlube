"use client"

/**
 * 18+ self-attestation interstitial. Legal formality layer, not security —
 * ID-grade verification per shipped-to-state law is a separate, later gate.
 * Remembers consent for 365 days via cookie.
 */
import { useEffect, useState } from "react"

const COOKIE = "nl_age_ok"

export default function AgeGate() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=1`))) {
      setShow(true)
    }
  }, [])

  if (!show) return null

  const accept = () => {
    const exp = new Date(Date.now() + 365 * 864e5).toUTCString()
    document.cookie = `${COOKIE}=1; expires=${exp}; path=/; SameSite=Lax`
    setShow(false)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/95 flex items-center justify-center p-6">
      <div className="max-w-md bg-white rounded-xl p-8 text-center">
        <h2 className="text-2xl font-semibold mb-3">Adults only</h2>
        <p className="text-sm text-zinc-600 mb-6">
          This store sells adult products. You must be 18 years or older (or the
          age of majority where you live) to enter.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={accept}
            className="bg-zinc-900 text-white rounded px-5 py-2"
          >
            I am 18 or older — Enter
          </button>
          <a
            href="https://www.google.com"
            className="border rounded px-5 py-2 text-zinc-700"
          >
            Leave
          </a>
        </div>
      </div>
    </div>
  )
}
