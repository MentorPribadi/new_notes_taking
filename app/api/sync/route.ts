import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

type NoteWire = {
  id: string
  title: string
  content: string
  tags: string[]
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
    err?.code === "42P01" // undefined_table (Postgres)
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = url.searchParams.get("deviceId")
    const since = url.searchParams.get("since")

    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 })
    }

    const supabase = getServerSupabase()
    let query = supabase.from("notes").select("*").eq("device_id", deviceId)

    if (since && /^\d+$/.test(since)) {
      const iso = toISO(Number(since))
      query = query.gte("updated_at", iso)
    }

    const { data, error } = await query.order("updated_at", { ascending: false })

    if (error) {
      if (isMissingTableError(error)) {
        // Treat as "no data yet" so the app works offline until migration runs
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
    const body = (await req.json()) as { deviceId?: string; notes?: NoteWire[] }
    const deviceId = body.deviceId
    const notes = body.notes ?? []

    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 })
    }
    if (!Array.isArray(notes)) {
      return NextResponse.json({ error: "Invalid notes payload" }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const rows = notes.map((n) => ({
      id: n.id,
      device_id: deviceId,
      title: n.title ?? "",
      content: n.content ?? "",
      tags: Array.isArray(n.tags) ? n.tags : [],
      pinned: !!n.pinned,
      archived: !!n.archived,
      trashed: !!n.trashed,
      created_at: toISO(n.createdAt ?? Date.now()),
      updated_at: toISO(n.updatedAt ?? Date.now()),
    }))

    const { error } = await supabase.from("notes").upsert(rows, { onConflict: "id" })

    if (error) {
      if (isMissingTableError(error)) {
        // Table isn't created yet; respond OK so UI doesn't error while offline
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
    const deviceId = url.searchParams.get("deviceId")
    const id = url.searchParams.get("id")

    if (!deviceId || !id) {
      return NextResponse.json({ error: "Missing deviceId or id" }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase.from("notes").delete().eq("device_id", deviceId).eq("id", id)

    if (error) {
      if (isMissingTableError(error)) {
        // Nothing to delete yet because table doesn't exist
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
