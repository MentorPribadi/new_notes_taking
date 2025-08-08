import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google" // AI SDK Google provider [^1]

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string
      title: string
      content: string
      existingTags?: string[]
    }

    const apiKey = body?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Generative AI API key is missing. Add it in Settings or set GOOGLE_GENERATIVE_AI_API_KEY." },
        { status: 400 }
      )
    }

    const model = google("gemini-2.5-flash", { apiKey })

    const prompt = `
You are a note organizer. Given a note's title and content, respond with strict JSON only:
{
  "category": string,
  "tags": string[]
}

- Title: ${body.title || "(none)"}
- Content:
${body.content?.slice(0, 6000) || "(empty)"}

Existing tags (avoid duplicates): ${(body.existingTags || []).join(", ")}

Rules:
- Keep tags concise and useful for filtering (lowercase, hyphens, no spaces).
- Do not include code fences or extra commentary.
- If uncertain, choose a reasonable category.
`.trim()

    const { text } = await generateText({ model, prompt }) // AI SDK usage [^1]

    let parsed = { category: "", tags: [] as string[] }
    try {
      const first = text.indexOf("{")
      const last = text.lastIndexOf("}")
      const json = text.slice(first, last + 1)
      parsed = JSON.parse(json)
    } catch {
      // ignore parsing errors; fall back to defaults
    }

    const category = String(parsed?.category || "").slice(0, 48)
    const tags = Array.from(
      new Set(
        (parsed?.tags || [])
          .map((t: any) => String(t).toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 12)
      )
    )

    return NextResponse.json({ category, tags })
  } catch (e: any) {
    console.error("POST /api/ai/classify error", e?.message || e)
    return NextResponse.json({ error: "AI classify failed" }, { status: 500 })
  }
}
