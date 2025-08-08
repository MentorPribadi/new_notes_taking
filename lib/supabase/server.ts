import { createClient } from "@supabase/supabase-js"

let singleton:
  | ReturnType<typeof createClient<any, "public", any>>
  | null = null

export function getServerSupabase() {
  if (singleton) return singleton
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  singleton = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return singleton
}
