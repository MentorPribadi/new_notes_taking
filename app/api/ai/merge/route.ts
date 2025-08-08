import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      apiKey?: string
      a: { title: string; content: string; tags?: string[] }
      b: { title: string; content: string; tags?: string[] }
    }
    if (!body?.apiKey) return NextResponse.json({ error: "Missing apiKey" }, { status: 400 })

    const provider = google({ apiKey: body.apiKey })
    const model = provider("models/gemini-1.5-flash")

    const prompt = `
You are a note merging assistant. You will merge two notes into one.
Return STRICT JSON ONLY:
{
  "shouldMerge": boolean,
  "title": string,
  "content": string
}

Rules:
- "shouldMerge" true only if b is clearly a duplicate/update/refinement of a.
- Keep a single, clean "title".
- Combine and de-duplicate content. Preserve checklists/bullets if present.
- Do not include commentary or code fences.

Note A:
Title: ${body.a.title || "(untitled)"}
Content:
${body.a.content?.slice(0, 6000) || "(empty)"}

Note B:
Title: ${body.b.title || "(untitled)"}
Content:
${body.b.content?.slice(0, 6000) || "(empty)"}
    `.trim()

    const { text } = await generateText({ model, prompt }) // AI SDK generateText [^1]

    let result = { shouldMerge: false, title: body.a.title, content: body.a.content }
    try {
      const first = text.indexOf("{"); const last = text.lastIndexOf("}")
      const json = text.slice(first, last + 1)
      const parsed = JSON.parse(json)
      result = {
        shouldMerge: !!parsed?.shouldMerge,
        title: String(parsed?.title ?? body.a.title ?? ""),
        content: String(parsed?.content ?? body.a.content ?? ""),
      }
    } catch {}

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("POST /api/ai/merge error", e?.message || e)
    return NextResponse.json({ error: "AI merge failed" }, { status: 500 })
  }
}
