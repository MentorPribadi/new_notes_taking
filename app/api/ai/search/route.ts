import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"
import { getServerSupabase } from "@/lib/supabase/server"

type WireNote = {
  id: string
  title: string
  content: string
  tags?: string[]
  category?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string
      deviceId?: string
      query: string
      notes?: WireNote[] // optional; if not provided, will fetch by deviceId
    }

    const apiKey = body?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Generative AI API key is missing. Add it in Settings or set GOOGLE_GENERATIVE_AI_API_KEY." },
        { status: 400 }
      )
    }
    if (!body.query?.trim()) return NextResponse.json({ results: [] })

    let notes: WireNote[] = []
    if (Array.isArray(body.notes) && body.notes.length > 0) {
      notes = body.notes
    } else if (body.deviceId) {
      const supabase = getServerSupabase()
      const { data, error } = await supabase
        .from("notes")
        .select("id,title,content,tags,category,ai_generated")
        .eq("device_id", body.deviceId)
        .eq("ai_generated", true)
        .order("updated_at", { ascending: false })
        .limit(500)
      if (!error && Array.isArray(data)) {
        notes = data.map((r: any) => ({
          id: r.id,
          title: r.title || "",
          content: r.content || "",
          tags: Array.isArray(r.tags) ? r.tags : [],
          category: r.category || "",
        }))
      }
    }

    if (notes.length === 0) return NextResponse.json({ results: [] })

    // Build compact corpus
    const corpus = notes.map((n) => ({
      id: n.id,
      title: n.title,
      tags: (n.tags || []).join(", "),
      category: n.category || "",
      snippet: (n.content || "").replace(/\s+/g, " ").slice(0, 400),
    }))

    const model = google("gemini-2.5-flash", { apiKey })
    const prompt = `
You are a retrieval assistant. Given a user query and a corpus of short notes, return relevant IDs with reasons.
Return STRICT JSON ONLY:
{
  "matches": [
    { "id": string, "reason": string }  // order by relevance
  ]
}

Query: ${body.query}

Corpus:
${JSON.stringify(corpus, null, 2).slice(0, 14000)}

Rules:
- Use title, tags, category, and snippet.
- Provide 1-10 matches with a brief reason each.
- Do not include code fences or commentary.
`.trim()

    const { text } = await generateText({ model, prompt }) // AI SDK usage [^1]

    let matches: { id: string; reason: string }[] = []
    try {
      const first = text.indexOf("{"); const last = text.lastIndexOf("}")
      const json = text.slice(first, last + 1)
      const parsed = JSON.parse(json)
      matches = Array.isArray(parsed?.matches) ? parsed.matches : []
    } catch {
      matches = []
    }

    // Map to enriched results
    const map = new Map(notes.map((n) => [n.id, n]))
    const results = matches
      .map((m) => {
        const n = map.get(m.id)
        if (!n) return null
        return {
          id: n.id,
          title: n.title,
          snippet: n.content.slice(0, 200),
          reason: String(m.reason || ""),
        }
      })
      .filter(Boolean)

    return NextResponse.json({ results })
  } catch (e: any) {
    console.error("POST /api/ai/search error", e?.message || e)
    return NextResponse.json({ error: "AI search failed" }, { status: 500 })
  }
}
