import Groq from "groq-sdk";

let groq: Groq | null = null;

export async function completeNewsJson(
  system: string,
  prompt: string,
  maxTokens: number,
): Promise<string | null> {
  if (process.env.GROQ_API_KEY) {
    try {
      groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
      const response = await groq.chat.completions.create({
        model: process.env.GROQ_NEWS_MODEL ?? "openai/gpt-oss-120b",
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });
      const content = response.choices[0]?.message?.content?.trim();
      if (content) {
        JSON.parse(content);
        return content;
      }
    } catch (error) {
      console.warn("[News AI] Groq:", (error as Error).message);
    }
  }

  if (!process.env.OPENROUTER_API_KEY) return null;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://statecraftcyber.vercel.app",
        "X-Title": "Statecraft Cyber Intelligence",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku",
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    JSON.parse(content);
    return content;
  } catch (error) {
    console.warn("[News AI] OpenRouter:", (error as Error).message);
    return null;
  }
}
