"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogIn } from 'lucide-react'
import { getBrowserSupabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

const REMEMBER_UNTIL_KEY = "auth-remember-until"

export default function SignupPage() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const router = useRouter()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [pending, setPending] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setPending(true)
    setInfo(null)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" as any })
        return
      }
      // If email confirmations are disabled, session will be present and we can continue.
      if (data.session) {
        const days30 = 30 * 24 * 60 * 60 * 1000
        const until = Date.now() + (remember ? days30 : days30)
        localStorage.setItem(REMEMBER_UNTIL_KEY, String(until))
        router.replace("/")
        return
      }
      // Otherwise, ask the user to verify their email.
      setInfo("Account created. Please check your email to verify your address, then sign in.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-[80vh] grid place-items-center p-4">
      <div className="w-full max-w-md rounded-lg border p-6">
        <div className="mb-4 flex items-center gap-2">
          <LogIn className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Create your account</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign up with email and password. You will stay signed in for 30 days.
        </p>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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

          <Button type="submit" disabled={pending}>
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>

        {info ? <p className="mt-3 text-sm text-muted-foreground">{info}</p> : null}

        <div className="mt-4 text-sm">
          <span className="text-muted-foreground">Already have an account?</span>{" "}
          <Link href="/signin" className="underline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
