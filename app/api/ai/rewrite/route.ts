import { NextResponse } from "next/server"
import { generateText } from "ai"
import { google } from "@ai-sdk/google"

const DEFAULT_TONE =
  "Make the note more clear and easier to understand. If possible, use bullet points."

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      apiKey?: string
      title?: string
      content: string
      tone?: string
    }

    const apiKey = body.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing Google Generative AI API key" },
        { status: 400 }
      )
    }

    const model = google("gemini-2.5-flash", { apiKey }) // AI SDK with Google provider [^1]
    const system =
      'You are an expert note editor. Rewrite the note to be clearer, simpler, and well-structured while preserving key facts, dates, and tasks. Use bullet points where helpful. Return strictly valid JSON with the shape {"title": string, "content": string} and NOTHING else.'
    const tone = (body.tone || DEFAULT_TONE).trim()

    const { text } = await generateText({
      model,
      system,
      prompt: [
        "User instructions (tone):",
        tone,
        "",
        "Original title:",
        body.title || "",
        "",
        "Original content:",
        body.content,
        "",
        "Return strictly JSON with keys title and content.",
      ].join("\n"),
    }) // [^1]

    // Try to extract JSON
    let jsonText = text.trim()
    const start = jsonText.indexOf("{")
    const end = jsonText.lastIndexOf("}")
    if (start !== -1 && end !== -1) {
      jsonText = jsonText.slice(start, end + 1)
    }
    let parsed: any
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      // Fallback minimal result
      parsed = {
        title: body.title || "",
        content: text,
      }
    }

    const title = typeof parsed.title === "string" ? parsed.title : body.title || ""
    const content = typeof parsed.content === "string" ? parsed.content : body.content

    return NextResponse.json({ title, content })
  } catch (e: any) {
    console.error("POST /api/ai/rewrite error", e?.message || e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
