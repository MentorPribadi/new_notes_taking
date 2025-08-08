"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Loader2 } from 'lucide-react'
import { getBrowserSupabase } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

const REMEMBER_UNTIL_KEY = "auth-remember-until"

function setRememberWindow(days = 30) {
  const until = Date.now() + days * 24 * 60 * 60 * 1000
  try {
    localStorage.setItem(REMEMBER_UNTIL_KEY, String(until))
  } catch {}
}

export default function AuthCallbackPage() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking")
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // If the URL contains an error hash from Supabase (e.g. #error=access_denied&error_code=otp_expired)
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      if (hash && hash.includes("error_code")) {
        const decoded = new URLSearchParams(hash.replace(/^#/, ""))
        const code = decoded.get("error_code") || "unknown_error"
        const description = decoded.get("error_description") || "Sign-in failed."
        if (!cancelled) {
          setStatus("error")
          setErrorText(`${code}: ${description}`)
        }
        return
      }

      // Some links redirect back with ?code= for a PKCE exchange
      const code = params.get("code")

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // In hash-based flows, the client will auto-detect the session on load.
          // Give it a moment, then check if a session exists.
          await new Promise((r) => setTimeout(r, 200))
        }

        const { data } = await supabase.auth.getSession()
        if (!data.session) throw new Error("No active session found. The link may be invalid or expired.")

        setRememberWindow(30)
        setStatus("ok")
        toast({ title: "Signed in", description: data.session.user.email || "" })
        router.replace("/")
      } catch (e: any) {
        if (cancelled) return
        setStatus("error")
        setErrorText(e?.message || "Sign-in failed. Please request a new magic link.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params, router, supabase, toast])

  if (status === "checking") {
    return (
      <main className="min-h-[70vh] grid place-items-center p-6 text-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finishing sign-in…
        </div>
      </main>
    )
  }

  if (status === "error") {
    return (
      <main className="min-h-[70vh] grid place-items-center p-6 text-center">
        <div className="w-full max-w-md rounded-lg border p-6">
          <h1 className="text-lg font-semibold mb-2">We couldn’t sign you in</h1>
          <p className="text-sm text-destructive mb-4">{errorText}</p>
          <p className="text-sm text-muted-foreground mb-4">
            Request a new magic link and open it within a few minutes. Ensure the link redirects to /auth/callback on your domain.
          </p>
          <Link href="/login" className="underline">
            Back to Login
          </Link>
        </div>
      </main>
    )
  }

  return null
}
