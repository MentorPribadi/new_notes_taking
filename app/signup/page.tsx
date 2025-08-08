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

export default function SignupPage() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)

  // Clean up any hash fragments like #access_token=... if present (from email verification)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      window.history.replaceState({}, "", window.location.pathname + window.location.search)
    }
  }, [])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || password !== confirm) {
      toast({ title: "Check inputs", description: "Passwords must match." })
      return
    }
    setPending(true)
    try {
      // Sign up with email+password
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Avoid passing emailRedirectTo here; manage verification URLs in the Supabase Dashboard to your deployed domain
      })
      if (error) {
        toast({ title: "Signup failed", description: error.message, variant: "destructive" as any })
        return
      }

      // Try immediate sign-in (works if email confirmation is disabled)
      const sign = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (sign.error) {
        // If confirmation required, guide user
        toast({
          title: "Verify your email",
          description: "We sent a confirmation email. After verifying, go to Sign in.",
        })
        // Stay on page; user will click Sign in after verifying
        return
      }

      // Remember for 30 days (auto)
      const days30 = 30 * 24 * 60 * 60 * 1000
      localStorage.setItem(REMEMBER_UNTIL_KEY, String(Date.now() + days30))
      window.location.href = "/"
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-lg border p-6">
        <h1 className="mb-2 text-lg font-semibold">Create your account</h1>
        <p className="mb-4 text-sm text-muted-foreground">Sign up with email and password.</p>
        <form onSubmit={handleSignup} className="grid gap-3">
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
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Sign Up"}
            </Button>
          </DialogFooter>
        </form>
        <div className="mt-4 text-sm">
          <span className="text-muted-foreground">Already have an account?</span>{" "}
          <Link className="underline" href="/signin">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
