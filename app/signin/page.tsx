"use client"

import Link from "next/link"
import { useMemo, useState, useEffect } from "react"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DialogFooter } from "@/components/ui/dialog"

const REMEMBER_UNTIL_KEY = "auth-remember-until"

export default function SigninPage() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [pending, setPending] = useState(false)

  // Clean up any hash fragments like #access_token=... if present
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      window.history.replaceState({}, "", window.location.pathname + window.location.search)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setPending(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        const msg = (error as any)?.message || "Sign-in error"
        if (String(msg).toLowerCase().includes("email not confirmed")) {
          toast({ title: "Confirm your email", description: "Please verify via the email we sent." })
        } else {
          toast({ title: "Sign-in failed", description: msg, variant: "destructive" as any })
        }
        return
      }
      const days30 = 30 * 24 * 60 * 60 * 1000
      const until = Date.now() + (remember ? days30 : days30) // always 30d per your request
      localStorage.setItem(REMEMBER_UNTIL_KEY, String(until))
      window.location.href = "/"
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-lg border p-6">
        <h1 className="mb-2 text-lg font-semibold">Sign in</h1>
        <p className="mb-4 text-sm text-muted-foreground">Use your email and password.</p>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="remember"
              type="checkbox"
              className="h-4 w-4 accent-foreground"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <Label htmlFor="remember">Remember me for 30 days</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in..." : "Sign In"}
            </Button>
          </DialogFooter>
        </form>
        <div className="mt-4 text-sm">
          <span className="text-muted-foreground">No account?</span>{" "}
          <Link className="underline" href="/signup">
            Create one
          </Link>
        </div>
      </div>
    </main>
  )
}
