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

export default function SigninPage() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const router = useRouter()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setPending(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        toast({ title: "Sign in failed", description: error.message, variant: "destructive" as any })
        return
      }
      const days30 = 30 * 24 * 60 * 60 * 1000
      const until = Date.now() + (remember ? days30 : days30)
      localStorage.setItem(REMEMBER_UNTIL_KEY, String(until))
      router.replace("/")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-[80vh] grid place-items-center p-4">
      <div className="w-full max-w-md rounded-lg border p-6">
        <div className="mb-4 flex items-center gap-2">
          <LogIn className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Sign in</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Enter your email and password.</p>

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
              autoComplete="current-password"
              placeholder="Your password"
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
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 text-sm">
          <span className="text-muted-foreground">New here?</span>{" "}
          <Link href="/signup" className="underline">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  )
}
