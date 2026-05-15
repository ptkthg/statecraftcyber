import Groq from "groq-sdk";
import type { NewsArticle } from "./news-feeds";

let _groq: Groq | null = null;
function getGroq(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null;
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

export interface EnrichedNews {
  title: string;
  summary: string;
  content: string;
  fromCache: boolean;
}

const SYSTEM = `Você é um jornalista sênior especializado em cibersegurança da Statecraft Cyber Intelligence. Escreva sempre em português brasileiro. Tom profissional e informativo, como G1 ou Folha de S.Paulo cobrindo tecnologia e segurança digital. Seja direto, preciso e completo. Nunca use travessões (— ou –): substitua por vírgulas ou reescreva a frase. Nunca use emojis.`;

function htmlToText(html: string): string {
  return html
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeTravessoes(s: string): string {
  return s.replace(/[—–]/g, ",").replace(/\s*,\s*/g, ", ").trim();
}

async function callGroq(article: NewsArticle): Promise<{ title: string; summary: string; content: string } | null> {
  const groq = getGroq();
  if (!groq) return null;

  const rawContent = article.content
    ? htmlToText(article.content).slice(0, 4000)
    : "";

  const userPrompt = `Com base nas informações abaixo de um artigo de cibersegurança, escreva uma NOTÍCIA COMPLETA em português brasileiro. Não é uma tradução: é uma notícia original escrita por você usando essas informações como fonte.

Fonte original: ${article.source}
Título original: ${article.title}
Resumo original: ${article.summary.slice(0, 800)}
Conteúdo original: ${rawContent || "(apenas o resumo acima está disponível)"}
CVEs mencionados: ${article.cves.join(", ") || "nenhum"}
Tags: ${article.tags.join(", ") || "nenhuma"}

Responda APENAS com um objeto JSON válido, sem texto fora do JSON:
{
  "title": "Manchete jornalística em PT-BR, direta e informativa (máximo 110 caracteres). Não use fórmulas como 'Entenda', 'Saiba mais', 'Veja'. Escreva como G1 ou Folha: ação concreta no título.",
  "summary": "Lide da notícia: 2 a 3 frases densas que condensam os fatos principais. Responda quem fez o quê, com qual impacto e em qual contexto. Máximo 160 palavras. Sem travessões.",
  "content": "Notícia completa em markdown. Estilo jornalístico expositivo e informativo: parágrafos corridos, sem seções roteirizadas, sem fórmulas fixas. Escreva como um repórter especializado que explica o assunto com profundidade e clareza para um leitor técnico. Mínimo 500 palavras.\n\nDirectrizes de escrita:\n- Comece desenvolvendo o contexto e os fatos centrais em 2 a 3 parágrafos\n- Use subtítulos (##) apenas quando houver uma quebra temática real, não como divisão mecânica\n- Aprofunde o aspecto técnico do tema: como funciona a vulnerabilidade, a campanha ou o incidente\n- Traga contexto histórico ou comparativo quando relevante\n- Conclua com as implicações para o setor e, se aplicável, com recomendações práticas integradas ao texto\n- Use **negrito** apenas em nomes de CVE, grupos APT, ferramentas maliciosas e produtos afetados\n- Sem listas de bullet no corpo principal\n- Sem travessões"
}`;

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      max_tokens: 2500,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (!parsed.title || !parsed.summary || !parsed.content) return null;

    return {
      title:   removeTravessoes(String(parsed.title)),
      summary: removeTravessoes(String(parsed.summary)),
      content: removeTravessoes(String(parsed.content)),
    };
  } catch (err) {
    console.error("[AI News] Falha na chamada Groq:", (err as Error).message);
    return null;
  }
}

// ── Cache via Prisma (NewsCache table) ────────────────────────────────────────

async function getFromCache(slug: string): Promise<{ title: string; summary: string; content: string } | null> {
  try {
    const { prisma } = await import("./prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await (prisma as any).newsCache.findUnique({ where: { slug } });
    if (!cached) return null;
    return { title: cached.title, summary: cached.summary, content: cached.content };
  } catch {
    return null;
  }
}

async function saveToCache(slug: string, data: { title: string; summary: string; content: string }, article: NewsArticle): Promise<void> {
  try {
    const { prisma } = await import("./prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).newsCache.upsert({
      where: { slug },
      create: { slug, ...data, source: article.source, originalUrl: article.url },
      update: { ...data, enrichedAt: new Date() },
    });
  } catch (err) {
    console.error("[AI News] Falha ao salvar cache:", (err as Error).message);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function getEnrichedArticle(article: NewsArticle): Promise<EnrichedNews> {
  const fallback: EnrichedNews = {
    title:     article.title,
    summary:   article.summary,
    content:   article.content ?? "",
    fromCache: false,
  };

  const cached = await getFromCache(article.slug);
  if (cached) return { ...cached, fromCache: true };

  const ai = await callGroq(article);
  if (!ai) return fallback;

  saveToCache(article.slug, ai, article).catch(() => {});

  return { ...ai, fromCache: false };
}
