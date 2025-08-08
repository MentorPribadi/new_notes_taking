import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = url.searchParams.get("deviceId")
    if (!deviceId) return NextResponse.json({ error: "Missing deviceId" }, { status: 400 })

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("device_id", deviceId)
      .order("updated_at", { ascending: false })
      .limit(200)
    if (error) {
      const msg = (error?.message || "").toLowerCase()
      if (msg.includes("schema") || msg.includes("could not find the table")) {
        return NextResponse.json({ items: [] })
      }
      console.error("GET /api/memory error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      items: (data || []).map((r: any) => ({
        id: r.id,
        content: r.content,
        topic: r.topic,
        importance: r.importance,
        sourceNoteId: r.source_note_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    })
  } catch (e: any) {
    console.error("GET /api/memory exception", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = url.searchParams.get("deviceId")
    const id = url.searchParams.get("id")
    if (!deviceId || !id) return NextResponse.json({ error: "Missing deviceId or id" }, { status: 400 })

    const supabase = getServerSupabase()
    const { error } = await supabase.from("memories").delete().eq("device_id", deviceId).eq("id", id)
    if (error) {
      const msg = (error?.message || "").toLowerCase()
      if (msg.includes("schema") || msg.includes("could not find the table")) {
        return NextResponse.json({ ok: false })
      }
      console.error("DELETE /api/memory error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("DELETE /api/memory exception", e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
