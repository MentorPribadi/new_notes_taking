import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

type NoteWire = {
  id: string
  title: string
  content: string
  tags: string[]
  category?: string
  aiGenerated?: boolean
  pinned: boolean
  archived: boolean
  trashed: boolean
  createdAt: number
  updatedAt: number
}

function toISO(ms: number) {
  try {
    return new Date(ms).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function isMissingTableError(err: any) {
  const msg = (err?.message || "").toLowerCase()
  const details = (err?.details || "").toLowerCase()
  const hint = (err?.hint || "").toLowerCase()
  return (
    msg.includes("schema cache") ||
    msg.includes("not found") ||
    msg.includes("could not find the table") ||
    details.includes("notes") ||
    hint.includes("notes") ||
    err?.code === "42P01"
  )
}

async function getAuthUserId(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const match = auth.match(/Bearer\s+(.+)/i)
  if (!match) return null
  const token = match[1]
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase.auth.getUser(token)
    if (error) return null
    return data.user?.id ?? null
  } catch {
    return null
  }
}

// Require login for ALL operations. Device-based sync is disabled.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const since = url.searchParams.get("since")
    const userId = await getAuthUserId(req)

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getServerSupabase()
    let query = supabase.from("notes").select("*").eq("user_id", userId)

    if (since && /^\d+$/.test(since)) {
      const iso = toISO(Number(since))
      query = query.gte("updated_at", iso)
    }

    const { data, error } = await query.order("updated_at", { ascending: false })

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ notes: [], hint: "missing_table" })
      }
      console.error("GET /api/sync error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const notes: NoteWire[] =
      (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title ?? "",
        content: r.content ?? "",
        tags: Array.isArray(r.tags) ? r.tags : [],
        category: r.category ?? "",
        aiGenerated: !!r.ai_generated,
        pinned: !!r.pinned,
        archived: !!r.archived,
        trashed: !!r.trashed,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      })) ?? []

    return NextResponse.json({ notes })
  } catch (e: any) {
    console.error("GET /api/sync exception", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as { notes?: NoteWire[] }
    const notes = body.notes ?? []

    if (!Array.isArray(notes)) {
      return NextResponse.json({ error: "Invalid notes payload" }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const rows = notes.map((n) => ({
      id: n.id,
      user_id: userId,
      device_id: null,
      title: n.title ?? "",
      content: n.content ?? "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      category: n.category ?? "",
      ai_generated: !!n.aiGenerated,
      pinned: !!n.pinned,
      archived: !!n.archived,
      trashed: !!n.trashed,
      created_at: toISO(n.createdAt ?? Date.now()),
      updated_at: toISO(n.updatedAt ?? Date.now()),
    }))

    const { error } = await supabase.from("notes").upsert(rows, { onConflict: "id" })

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ ok: false, count: 0, hint: "missing_table" })
      }
      console.error("POST /api/sync error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e: any) {
    console.error("POST /api/sync exception", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    const userId = await getAuthUserId(req)

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ ok: false, hint: "missing_table" })
      }
      console.error("DELETE /api/sync error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("DELETE /api/sync exception", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
