"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Mail } from 'lucide-react'
import { getBrowserSupabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export default function LoginPage() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const router = useRouter()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setPending(true)
    setErrorText(null)
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      })

      if (error) {
        setErrorText(error.message)
        toast({ title: "Magic link failed", description: error.message, variant: "destructive" as any })
        return
      }

      setSent(true)
      toast({
        title: "Magic link sent",
        description: "Check your email and click the link to finish signing in.",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-[80vh] grid place-items-center p-4">
      <div className="w-full max-w-md rounded-lg border p-6">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Sign in with a magic link</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Enter your email and we’ll send you a secure one-time sign-in link. You’ll stay signed in for 30 days.
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

          <Button type="submit" disabled={pending || sent}>
            {pending ? "Sending…" : sent ? "Link sent" : "Send Magic Link"}
          </Button>
        </form>

        {errorText ? (
          <p className="mt-3 text-sm text-destructive">{errorText}</p>
        ) : null}

        <div className="mt-4 text-xs text-muted-foreground space-y-2">
          <p>
            Tip: Make sure your Supabase Auth settings include this URL in Redirect URLs:
          </p>
          <ul className="list-disc pl-5">
            <li>
              {typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "/auth/callback"}
            </li>
            <li>http://localhost:3000/auth/callback</li>
          </ul>
          <p>
            If you got “otp_expired”, request a new link and open it within a few minutes.
          </p>
        </div>

        <div className="mt-4 text-sm">
          <Link href="/" className="underline">
            Back to app
          </Link>
        </div>
      </div>
    </main>
  )
}
