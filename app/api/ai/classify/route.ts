import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google" // AI SDK Google provider [^1]

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      apiKey?: string
      title: string
      content: string
      existingTags?: string[]
    }

    if (!body?.apiKey) {
      return NextResponse.json({ error: "Missing apiKey" }, { status: 400 })
    }

    const provider = google({ apiKey: body.apiKey })
    const model = provider("models/gemini-1.5-flash")

    const prompt = `
You are a note organizer. Given a note's title and content, respond with strict JSON only:
{
  "category": string,            // one concise category like "Work", "Personal", "Ideas", "Tasks", etc.
  "tags": string[]               // 3-8 short tags (lowercase, no spaces; use hyphens)
}

- Title: ${body.title || "(none)"}
- Content:
${body.content?.slice(0, 6000) || "(empty)"}

Existing tags (avoid duplicates): ${(body.existingTags || []).join(", ")}

Rules:
- Keep tags concise and useful for filtering.
- Do not include code fences or extra commentary.
- If uncertain, choose a reasonable category.
    `.trim()

    const { text } = await generateText({
      model,
      prompt
    }) // Using AI SDK generateText with Google provider [^1]

    let parsed = { category: "", tags: [] as string[] }
    try {
      const firstBrace = text.indexOf("{")
      const lastBrace = text.lastIndexOf("}")
      const json = text.slice(firstBrace, lastBrace + 1)
      parsed = JSON.parse(json)
    } catch {
      // fallback: leave defaults
    }

    // Normalize
    const category = String(parsed?.category || "").slice(0, 48)
    const tags = Array.from(new Set((parsed?.tags || [])
      .map((t: any) => String(t).toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 12)))

    return NextResponse.json({ category, tags })
  } catch (e: any) {
    console.error("POST /api/ai/classify error", e?.message || e)
    return NextResponse.json({ error: "AI classify failed" }, { status: 500 })
  }
}
