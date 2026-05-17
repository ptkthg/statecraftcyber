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

const SYSTEM = `Você é um jornalista sênior de cibersegurança da Statecraft Cyber Intelligence. Escreva sempre em português brasileiro. Tom jornalístico, neutro, objetivo e informativo, como G1, Folha de S.Paulo ou Reuters cobrindo tecnologia e segurança. Não invente informações que não estejam na fonte. Não use linguagem sensacionalista. Diferencie claramente fato, contexto e impacto. Nunca use travessões (— ou –): substitua por vírgulas ou reescreva a frase. Nunca use emojis.`;

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

  const userPrompt = `Com base nas informações abaixo, escreva uma NOTÍCIA JORNALÍSTICA COMPLETA em português brasileiro. Não é uma tradução: é uma notícia original que você redige usando essas informações como fonte primária.

Fonte original: ${article.source}
Título original: ${article.title}
Resumo original: ${article.summary.slice(0, 800)}
Conteúdo original: ${rawContent || "(apenas o resumo acima está disponível)"}
CVEs mencionados: ${article.cves.join(", ") || "nenhum"}
Tags: ${article.tags.join(", ") || "nenhuma"}

Responda APENAS com um objeto JSON válido, sem texto fora do JSON:
{
  "title": "Manchete jornalística em PT-BR. Máximo 110 caracteres. Use verbo de ação no presente ou passado recente. Não use 'Entenda', 'Saiba mais', 'Veja', 'Conheça'. Escreva como manchete do G1 ou Folha: o fato principal de forma clara e direta.",
  "summary": "Lide jornalístico: 2 a 3 frases que respondem quem, o quê, quando, onde e por que importa. Coloque o fato mais relevante na primeira frase. Seja denso, direto e informativo. Máximo 160 palavras. Sem travessões.",
  "content": "Notícia completa em markdown. Mínimo 500 palavras. Siga esta estrutura editorial:\n\n1. Parágrafo de abertura: o fato principal com contexto imediato. Quem está envolvido, o que aconteceu, qual o impacto direto.\n2. Contexto: por que esse evento aconteceu, qual o histórico do ator, da organização ou da vulnerabilidade envolvida. Situe o leitor no cenário mais amplo.\n3. Impacto: quem foi afetado, em que escala, quais os riscos para empresas, usuários ou infraestruturas. Dados e estimativas quando disponíveis na fonte.\n4. Detalhes técnicos: como a vulnerabilidade funciona, qual o vetor de ataque, quais sistemas ou versões estão expostos. Use linguagem técnica mas acessível.\n5. Encerramento: desdobramentos esperados, medidas recomendadas ou ações já tomadas. Cite a fonte original.\n\nRegras de escrita:\n- Parágrafos corridos. Sem listas de bullet no corpo principal.\n- Use subtítulos (##) apenas quando houver quebra temática real, não como divisão mecânica.\n- **Negrito** apenas em: nomes de CVE, grupos APT, ferramentas maliciosas e produtos afetados.\n- Tom neutro e objetivo. Sem exageros, sem alarmismo, sem julgamentos editoriais.\n- Não invente dados. Só use o que está na fonte.\n- Sem travessões.\n\nVariedade obrigatória de conectivos e aberturas:\n- Nunca comece dois parágrafos consecutivos com a mesma palavra ou estrutura.\n- Alterne os conectivos de transição: em vez de repetir sempre 'além disso' ou 'no entanto', use também 'nesse contexto', 'paralelamente', 'de forma complementar', 'em resposta a isso', 'até o momento', 'segundo a fonte', 'na prática', 'do ponto de vista técnico', 'para as organizações afetadas', 'o cenário se complica quando', entre outros.\n- Varie a abertura dos parágrafos: alterne entre começar com o sujeito principal, com uma circunstância de tempo ou lugar, com uma consequência, com uma citação indireta da fonte, ou com um dado concreto.\n- O texto deve soar como escrito por um humano com vocabulário amplo, não como um modelo repetindo fórmulas."
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
    const cached = await prisma.newsCache.findUnique({ where: { slug } });
    if (!cached) return null;
    return { title: cached.title, summary: cached.summary, content: cached.content };
  } catch {
    return null;
  }
}

async function saveToCache(slug: string, data: { title: string; summary: string; content: string }, article: NewsArticle): Promise<void> {
  try {
    const { prisma } = await import("./prisma");
    await prisma.newsCache.upsert({
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
