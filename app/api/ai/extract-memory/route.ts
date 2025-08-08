import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"
import { getServerSupabase } from "@/lib/supabase/server"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string
      deviceId?: string
      noteId?: string
      content: string
    }

    const apiKey = body?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Generative AI API key is missing. Add it in Settings or set GOOGLE_GENERATIVE_AI_API_KEY." },
        { status: 400 }
      )
    }
    if (!body?.deviceId) return NextResponse.json({ error: "Missing deviceId" }, { status: 400 })

    const model = google("gemini-2.5-flash", { apiKey })
    const prompt = `
You are a memory extraction agent. Extract personal or project-relevant facts worth remembering from the note content.
Return STRICT JSON ONLY:
{
  "memories": [
    { "content": string, "topic": string, "importance": number } // 1-5
  ]
}

Guidelines:
- Include only high-signal items: decisions, deadlines, preferences, project facts.
- Keep "content" short and self-contained.
- 0-10 items max.

Content:
${body.content?.slice(0, 8000) || "(empty)"}
`.trim()

    const { text } = await generateText({ model, prompt }) // AI SDK usage [^1]

    let items: { content: string; topic: string; importance: number }[] = []
    try {
      const first = text.indexOf("{"); const last = text.lastIndexOf("}")
      const json = text.slice(first, last + 1)
      const parsed = JSON.parse(json)
      items = Array.isArray(parsed?.memories) ? parsed.memories : []
    } catch {
      items = []
    }

    const supabase = getServerSupabase()
    const rows = items
      .map((m) => ({
        device_id: body.deviceId!,
        content: String(m.content || "").slice(0, 1000),
        topic: String(m.topic || "").slice(0, 100),
        importance: Math.max(1, Math.min(5, Number(m.importance) || 3)),
        source_note_id: body.noteId ?? null,
      }))
      .filter((r) => r.content.trim().length > 0)

    if (rows.length > 0) {
      const { error } = await supabase.from("memories").upsert(rows, { onConflict: "device_id,content_md5" })
      if (error) {
        const msg = (error?.message || "").toLowerCase()
        if (!msg.includes("schema") && !msg.includes("could not find the table")) {
          console.error("extract-memory upsert error", error)
        }
      }
    }

    return NextResponse.json({ added: rows.length, items: rows })
  } catch (e: any) {
    console.error("POST /api/ai/extract-memory error", e?.message || e)
    return NextResponse.json({ error: "AI memory extraction failed" }, { status: 500 })
  }
}
