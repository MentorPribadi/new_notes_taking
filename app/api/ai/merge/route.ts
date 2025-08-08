import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string
      a: { title: string; content: string; tags?: string[] }
      b: { title: string; content: string; tags?: string[] }
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
You are a note merging assistant. Merge two notes into one if B is a duplicate/update of A.
Return STRICT JSON ONLY:
{
  "shouldMerge": boolean,
  "title": string,
  "content": string
}

Note A:
Title: ${body.a.title || "(untitled)"}
Content:
${body.a.content?.slice(0, 6000) || "(empty)"}

Note B:
Title: ${body.b.title || "(untitled)"}
Content:
${body.b.content?.slice(0, 6000) || "(empty)"}
`.trim()

    const { text } = await generateText({ model, prompt }) // AI SDK usage [^1]

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
