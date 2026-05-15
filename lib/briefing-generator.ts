import type { RawThreatItem, RawIOC, Severity, Confidence } from "./threat-sources/types";
import { scoreSeverity, inferCategory } from "./severity-scoring";
import { generateSlug, ensureUniqueSlug } from "./deduplication";
import { generateAiBriefing } from "./ai-briefing";

export interface GeneratedBriefing {
  title: string;
  slug: string;
  summary: string;
  content: string;
  severity: Severity;
  category: string;
  tags: string[];
  affectedSectors: string[];
  affectedRegions: string[];
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: Date | null;
  iocs: RawIOC[];
  cves: string[];
  mitreTechniques: string[];
  epssScore: number | null;
  cvssScore: number | null;
  confidence: Confidence;
  readingTime: number;
}

// ── Labels ────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const MITRE_NAMES: Record<string, string> = {
  T1566: "Phishing",
  "T1566.001": "Spearphishing via Anexo",
  "T1566.002": "Spearphishing via Link",
  T1059: "Execução via Interpretadores de Comando",
  "T1059.001": "PowerShell",
  "T1059.003": "Windows Command Shell",
  T1078: "Abuso de Contas Válidas",
  T1190: "Exploração de Serviço Público",
  T1133: "Serviços Externos Remotos",
  T1136: "Criação de Conta",
  "T1505.003": "Web Shell",
  T1071: "Protocolos de Camada de Aplicação",
  "T1071.001": "Protocolos Web (HTTP/S)",
  T1486: "Criptografia de Dados para Impacto (Ransomware)",
  T1489: "Interrupção de Serviço",
  T1490: "Inibição de Recuperação do Sistema",
  T1027: "Ofuscação de Arquivos e Informações",
  T1055: "Injeção de Processo",
  T1105: "Transferência de Ferramenta via Rede",
  "T1583.008": "Aquisição de Infraestrutura de Rede",
  T1204: "Execução por Ação do Usuário",
  T1562: "Evasão e Desvio de Defesas",
  T1110: "Ataques de Força Bruta",
  T1021: "Serviços Remotos",
  T1036: "Mascaramento",
  T1003: "Dump de Credenciais",
  T1082: "Descoberta de Informações do Sistema",
};

// ── Formatação de IOCs ────────────────────────────────────────────────────

const IOC_TYPE_PT: Record<string, string> = {
  ip: "Endereços IP",
  domain: "Domínios Maliciosos",
  url: "URLs Maliciosas",
  hash: "Hashes de Arquivo",
  email: "Endereços de E-mail",
  file: "Nomes de Arquivo",
  c2: "Servidores de Comando e Controle (C2)",
};

function formatIocSection(iocs: RawIOC[]): string {
  if (iocs.length === 0) return "";

  const byType: Record<string, RawIOC[]> = {};
  for (const ioc of iocs.slice(0, 40)) {
    if (!byType[ioc.type]) byType[ioc.type] = [];
    byType[ioc.type].push(ioc);
  }

  const confLabel: Record<string, string> = {
    high: "confirmado",
    medium: "provável",
    low: "suspeito",
  };

  const parts: string[] = [];
  for (const [type, list] of Object.entries(byType)) {
    const label = IOC_TYPE_PT[type] ?? type.toUpperCase();
    parts.push(`### ${label} (${list.length})`);
    for (const ioc of list.slice(0, 15)) {
      const conf = confLabel[ioc.confidence] ?? ioc.confidence;
      parts.push(`- \`${ioc.value}\` (${conf}) | fonte: ${ioc.source}`);
    }
  }

  const total = iocs.length;
  if (total > 40) {
    parts.push(`\nLista parcial. Total de ${total} indicadores identificados. Consulte a fonte original para a lista completa.`);
  }

  return parts.join("\n");
}

function formatMitreSection(techniques: string[]): string {
  if (techniques.length === 0) return "";
  return techniques
    .slice(0, 6)
    .map((t) => {
      const name = MITRE_NAMES[t] ?? "Técnica adversária";
      return `- **[${t}](https://attack.mitre.org/techniques/${t.replace(".", "/")})**: ${name}`;
    })
    .join("\n");
}

// ── Gerador narrativo por tipo de briefing ────────────────────────────────

/**
 * Briefing estilo CVE — baseado em CISA KEV / NVD.
 * Produz texto narrativo em PT-BR descrevendo a vulnerabilidade,
 * risco, contexto de exploração e ações imediatas.
 */
function buildCveBriefingContent(item: RawThreatItem, severity: Severity): string {
  const cve = item.cves?.[0] ?? "CVE desconhecida";
  const cvss = item.cvssScore;
  const epss = item.epssScore;
  const products = (item.affectedProducts ?? []).join(", ") || "produtos identificados";
  const sectors = (item.affectedSectors ?? ["Corporativo"]).join(", ");
  const isKev = item.inCisaKev;

  // ── O que aconteceu ──
  let happened = `A **${cve}** é uma vulnerabilidade de severidade **${SEVERITY_LABELS[severity]}**`;

  if (cvss) {
    happened += ` com pontuação CVSS ${cvss.toFixed(1)}`;
  }
  happened += `, identificada em **${products}**.\n\n`;
  happened += `${item.description}\n\n`;

  if (isKev) {
    happened += `A vulnerabilidade foi adicionada ao **Catálogo KEV da CISA** (Known Exploited Vulnerabilities), `;
    happened += `confirmando exploração ativa em ambientes reais por agentes de ameaça. `;
    happened += `A CISA exige remediação mandatória para agências federais dos EUA, `;
    happened += `e a recomendação é que organizações privadas tratem com a mesma urgência.`;
  }

  if (epss !== undefined && epss !== null) {
    const pct = (epss * 100).toFixed(1);
    const riskDesc =
      epss >= 0.7
        ? "extremamente elevada, com exploits amplamente disponíveis"
        : epss >= 0.4
        ? "alta, indicando ferramentas de exploit já circulando em fóruns"
        : epss >= 0.1
        ? "moderada"
        : "ainda em desenvolvimento";
    happened += `\n\nO score **EPSS de ${pct}%** indica que a probabilidade de exploração nos próximos 30 dias é ${riskDesc}.`;
  }

  // ── Quem pode ser afetado ──
  const affected = `**Setores:** ${sectors}\n\n**Produtos afetados:** ${products}\n\n` +
    `Qualquer organização que utilize ${products} em versões vulneráveis e exponha ` +
    `a interface afetada à rede interna ou à internet está sob risco imediato.`;

  // ── Impacto para PMEs ──
  const smb = buildSmb(item, severity);

  // ── Recomendações ──
  const recs = buildRecommendations(item, severity);

  // ── Fontes ──
  const sources = buildSources(item, item.cves ?? []);

  // ── Confiança ──
  const { confidence } = scoreSeverity(item);
  const confText = buildConfidenceText(confidence, item);

  const sections: string[] = [];

  sections.push(`## O que aconteceu\n\n${happened}`);
  sections.push(`## Quem pode ser afetado\n\n${affected}`);

  const mitre = formatMitreSection(item.mitreTechniques ?? []);
  if (mitre) sections.push(`## Técnicas MITRE ATT&CK\n\n${mitre}`);

  sections.push(`## IOCs Identificados\n\n${formatIocSection(item.iocs ?? [])}`);
  sections.push(`## Ações Recomendadas\n\n${recs}`);
  sections.push(`## Nível de Confiança\n\n${confText}`);

  return sections.join("\n\n---\n\n");
}

/**
 * Briefing estilo campanha/pulso — baseado em OTX, RSS, abuse.ch.
 * Tom mais narrativo, contextualiza o ator/campanha.
 */
function buildCampaignBriefingContent(item: RawThreatItem, severity: Severity): string {
  const sectors = (item.affectedSectors ?? ["Geral"]).join(", ");
  const regions = (item.affectedRegions ?? ["Global"]).join(", ");
  const iocCount = (item.iocs ?? []).length;

  // ── O que aconteceu ──
  let happened = `${item.description}\n\n`;

  if (iocCount > 0) {
    happened += `A análise desta campanha identificou **${iocCount} indicador${iocCount > 1 ? "es" : ""} de comprometimento (IOC${iocCount > 1 ? "s" : ""})** `;
    happened += `distribuídos entre ${Object.keys(groupIocsByType(item.iocs ?? [])).map((t) => IOC_TYPE_PT[t] ?? t).join(", ")}.`;
  }

  const cveCount = (item.cves ?? []).length;
  if (cveCount > 0) {
    happened += `\n\nForam identificadas **${cveCount} CVE${cveCount > 1 ? "s" : ""}** associadas a esta campanha: ${item.cves!.join(", ")}.`;
  }

  // ── Quem pode ser afetado ──
  const affected = `**Setores em risco:** ${sectors}\n\n**Regiões alvo:** ${regions}\n\n` +
    buildSectorContext(item.affectedSectors ?? []);

  // ── Impacto ──
  const smb = buildSmb(item, severity);

  // ── Recomendações ──
  const recs = buildRecommendations(item, severity);

  // ── Fontes ──
  const sources = buildSources(item, item.cves ?? []);

  // ── Confiança ──
  const { confidence } = scoreSeverity(item);
  const confText = buildConfidenceText(confidence, item);

  const sections: string[] = [];

  sections.push(`## O que aconteceu\n\n${happened}`);
  sections.push(`## Quem pode ser afetado\n\n${affected}`);

  const mitre = formatMitreSection(item.mitreTechniques ?? []);
  if (mitre) sections.push(`## Técnicas MITRE ATT&CK\n\n${mitre}`);

  sections.push(`## IOCs Identificados\n\n${formatIocSection(item.iocs ?? [])}`);
  sections.push(`## Ações Recomendadas\n\n${recs}`);
  sections.push(`## Nível de Confiança\n\n${confText}`);

  return sections.join("\n\n---\n\n");
}

// ── Helpers compartilhados ────────────────────────────────────────────────

function groupIocsByType(iocs: RawIOC[]): Record<string, RawIOC[]> {
  const out: Record<string, RawIOC[]> = {};
  for (const ioc of iocs) {
    if (!out[ioc.type]) out[ioc.type] = [];
    out[ioc.type].push(ioc);
  }
  return out;
}

function buildSectorContext(sectors: string[]): string {
  const ctx: string[] = [];
  if (sectors.some((s) => /financ|banco|fintech/i.test(s)))
    ctx.push("Organizações financeiras devem redobrar atenção ao monitoramento de acessos e transações atípicas.");
  if (sectors.some((s) => /saúde|health|hospital/i.test(s)))
    ctx.push("Instituições de saúde são alvos prioritários por conta do valor dos dados de pacientes e da criticidade dos sistemas.");
  if (sectors.some((s) => /governo|gov|público/i.test(s)))
    ctx.push("Órgãos governamentais devem avaliar exposição de sistemas críticos e intensificar o monitoramento.");
  if (sectors.some((s) => /infra|energia|utilidade/i.test(s)))
    ctx.push("Infraestruturas críticas devem priorizar isolamento e resposta imediata.");
  if (ctx.length === 0)
    ctx.push("Organizações de qualquer porte nos setores mencionados devem avaliar sua exposição e aplicar as mitigações recomendadas.");
  return ctx.join(" ");
}

function buildSmb(item: RawThreatItem, severity: Severity): string {
  const text: string[] = [];
  const desc = `${item.title} ${item.description}`.toLowerCase();
  const hasBrazil = (item.affectedRegions ?? []).some((r) => /brasil|brazil|latam|global/i.test(r));

  if (item.cves?.length && item.cvssScore && item.cvssScore >= 7) {
    text.push(
      `PMEs que utilizam **${(item.affectedProducts ?? ["os produtos afetados"]).slice(0, 2).join(" ou ")}** devem ` +
        `priorizar a aplicação de patches imediatamente, especialmente se esses sistemas estão expostos à internet ou a redes sem segmentação adequada.`
    );
  } else if (/phishing|credential|identidade/.test(desc)) {
    text.push(
      `Empresas sem **autenticação multifator (MFA)** habilitada e sem treinamento regular de conscientização ` +
        `são os alvos primários desta campanha. O custo de implementar MFA é significativamente menor que o custo médio de um incidente de credenciais comprometidas.`
    );
  } else if (/ransomware/.test(desc)) {
    text.push(
      `PMEs com **backups inadequados**, sem testes de restauração regulares ou sem segmentação de rede são especialmente ` +
        `vulneráveis ao impacto de ransomware. O custo médio de recuperação supera USD 1,4M para empresas de médio porte.`
    );
  } else if (/malware|trojan|botnet/.test(desc)) {
    text.push(
      `PMEs com soluções de endpoint desatualizadas ou sem monitoramento ativo são alvos fáceis. ` +
        `Implemente EDR e garanta que antivírus esteja atualizado em todos os dispositivos.`
    );
  } else {
    text.push(
      `Organizações de qualquer porte devem avaliar se utilizam os produtos ou serviços mencionados e aplicar ` +
        `as recomendações desta análise com prioridade proporcional à severidade (${SEVERITY_LABELS[severity]}).`
    );
  }

  if (hasBrazil) {
    text.push(`**Relevância para o Brasil:** Esta ameaça apresenta impacto direto ou histórico de atuação no contexto brasileiro.`);
  }

  return text.join("\n\n");
}

function buildRecommendations(item: RawThreatItem, severity: Severity): string {
  const lines: string[] = [];
  const desc = `${item.title} ${item.description}`.toLowerCase();

  if (item.cves?.length) {
    lines.push(`- **[Urgente]** Aplique os patches de segurança disponíveis para ${item.cves.slice(0, 2).join(", ")} com prioridade máxima.`);
    lines.push(`- Verifique quais sistemas afetados estão expostos à internet e considere isolamento temporário até a aplicação do patch.`);
  }

  if (item.inCisaKev) {
    lines.push(`- **[Crítico, CISA KEV]** Esta vulnerabilidade tem exploração ativa confirmada. Trate a remediação como emergência operacional e documente o prazo de aplicação.`);
  }

  if ((item.iocs?.length ?? 0) > 0) {
    lines.push(`- Adicione todos os IOCs listados às regras de bloqueio do **firewall**, **SIEM** e **EDR** imediatamente.`);
    lines.push(`- Execute uma busca retroativa nos logs das últimas **72 horas** utilizando os IOCs fornecidos para identificar possível comprometimento anterior.`);
  }

  if (/phishing/.test(desc)) {
    lines.push(`- Reforce o treinamento anti-phishing com a equipe e habilite **MFA em todos os acessos críticos** (e-mail, VPN, painéis administrativos).`);
    lines.push(`- Configure regras de filtragem de e-mail para bloquear domínios e remetentes listados como maliciosos.`);
  }

  if (/ransomware/.test(desc)) {
    lines.push(`- Verifique imediatamente se **backups offline** estão íntegros e testados para recuperação (regra 3-2-1).`);
    lines.push(`- Revise privilégios administrativos aplicando **least privilege** e implemente segmentação de rede para limitar o movimento lateral.`);
  }

  if (/botnet|c2|command/.test(desc)) {
    lines.push(`- Bloqueie os domínios e IPs de C2 listados no firewall de borda e nos proxies de saída.`);
    lines.push(`- Monitore tráfego de saída incomum para os indicadores identificados, especialmente em horários fora do expediente.`);
  }

  if (severity === "critical" || severity === "high") {
    lines.push(`- Escalone para o time de segurança e liderança imediatamente. Documente todas as ações tomadas com timestamps para eventual relatório de incidente.`);
  }

  if (lines.length === 0) {
    lines.push(`- Monitore os indicadores fornecidos nas ferramentas de segurança da organização.`);
    lines.push(`- Mantenha sistemas e softwares atualizados e aplique patches de segurança regularmente.`);
    lines.push(`- Implemente monitoramento contínuo para detectar comportamentos anômalos associados a esta ameaça.`);
  }

  return lines.join("\n");
}

function buildSources(item: RawThreatItem, cves: string[]): string {
  const lines: string[] = [];

  // Fonte principal
  const pubDate = item.publishedAt
    ? item.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "Data não informada";
  lines.push(`- **[${item.sourceName}](${item.sourceUrl})**, publicado em ${pubDate}`);

  // Links de referência adicionais por CVE
  for (const cve of cves.slice(0, 3)) {
    lines.push(`- **[NVD: ${cve}](https://nvd.nist.gov/vuln/detail/${cve})**: National Vulnerability Database (NIST)`);
    if (item.inCisaKev) {
      lines.push(`- **[CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)**: Known Exploited Vulnerabilities Catalog`);
    }
    lines.push(`- **[EPSS: ${cve}](https://api.first.org/data/v1/epss?cve=${cve})**: Exploit Prediction Scoring System (FIRST)`);
  }

  // Link MITRE ATT&CK se tiver técnicas
  if (item.mitreTechniques?.length) {
    lines.push(`- **[MITRE ATT&CK](https://attack.mitre.org/)**: Framework de táticas e técnicas adversárias`);
  }

  return lines.join("\n");
}

function buildConfidenceText(confidence: Confidence, item: RawThreatItem): string {
  const label = CONFIDENCE_LABELS[confidence];
  const detail =
    confidence === "high"
      ? `Dados extraídos diretamente de **${item.sourceName}**, fonte primária de inteligência de ameaças com histórico de alta precisão. IOCs e CVEs foram validados contra bases de dados públicas.`
      : confidence === "medium"
      ? `Informações parcialmente corroboradas. A análise é baseada em dados da fonte primária, mas pode carecer de validação adicional por múltiplas fontes independentes.`
      : `Dados em fase inicial. Esta ameaça possui informações limitadas disponíveis publicamente. Recomenda-se acompanhamento das fontes primárias para atualização.`;

  return `**${label}**\n\n${detail}`;
}

// ── Gerador de summary (executive summary) ───────────────────────────────

function buildExecutiveSummary(item: RawThreatItem, severity: Severity): string {
  const cve = item.cves?.[0];
  const cvss = item.cvssScore;
  const epss = item.epssScore;
  const isKev = item.inCisaKev;
  const products = (item.affectedProducts ?? []).slice(0, 2).join(" e ");

  if (cve) {
    const parts: string[] = [];

    // Frase principal
    if (products) {
      parts.push(`Vulnerabilidade **${SEVERITY_LABELS[severity].toLowerCase()}** em **${products}** (${cve})`);
    } else {
      parts.push(`**${cve}**: vulnerabilidade de severidade **${SEVERITY_LABELS[severity]}**`);
    }

    if (cvss) parts.push(`com CVSS ${cvss.toFixed(1)}`);

    // Tipo de impacto (inferido da descrição)
    const desc = item.description.toLowerCase();
    if (/remote code|execução remota|rce/.test(desc)) parts.push(`permite execução remota de código`);
    else if (/privilege escal|elevação de privilégio/.test(desc)) parts.push(`permite elevação de privilégios`);
    else if (/authentication bypass|bypass de autenticação/.test(desc)) parts.push(`permite bypass de autenticação`);
    else if (/denial.of.service|ddos/.test(desc)) parts.push(`pode causar negação de serviço`);
    else if (/file upload|upload de arquivo/.test(desc)) parts.push(`permite upload de arquivos maliciosos`);

    let summary = parts.join(" ") + ".";

    if (epss !== null && epss !== undefined) {
      const pct = (epss * 100).toFixed(1);
      summary += ` EPSS de **${pct}%** indica ${epss >= 0.5 ? "alta probabilidade de exploração ativa" : "risco moderado de exploração"} nos próximos 30 dias.`;
    }

    if (isKev) {
      summary += ` **Incluída no catálogo CISA KEV. Exploração ativa confirmada. Patch imediato obrigatório.**`;
    }

    return summary;
  }

  // Briefing de campanha
  const sectors = (item.affectedSectors ?? []).slice(0, 2).join(" e ");
  const iocCount = (item.iocs ?? []).length;
  const desc = item.description.slice(0, 280).replace(/\s+\S*$/, "");

  let summary = `${desc}.`;
  if (sectors) summary += ` Setores afetados: **${sectors}**.`;
  if (iocCount > 0) summary += ` **${iocCount} IOC${iocCount > 1 ? "s" : ""} identificados**.`;

  return summary;
}

// ── Estimativa de tempo de leitura ────────────────────────────────────────

function estimateReadingTime(content: string): number {
  return Math.max(3, Math.ceil(content.split(/\s+/).length / 200));
}

// ── Gerador principal ────────────────────────────────────────────────────

function buildBase(item: RawThreatItem, existingSlugs: Set<string>) {
  const { severity, confidence } = scoreSeverity(item);
  const category = inferCategory(item);
  const isCveBriefing = (item.cves?.length ?? 0) > 0;

  const templateSummary = buildExecutiveSummary(item, severity);
  const templateContent = isCveBriefing
    ? buildCveBriefingContent(item, severity)
    : buildCampaignBriefingContent(item, severity);

  const tags = [
    ...new Set([
      ...(item.tags ?? []),
      category.toLowerCase().replace(/[\s&]+/g, "-"),
      SEVERITY_LABELS[severity].toLowerCase(),
      ...(item.inCisaKev ? ["cisa-kev"] : []),
    ]),
  ].slice(0, 12);

  const baseSlug = generateSlug(item.title);
  const slug = ensureUniqueSlug(baseSlug, existingSlugs);
  existingSlugs.add(slug);

  return { severity, confidence, category, tags, slug, templateSummary, templateContent };
}

/** Versão assíncrona — usa Groq se GROQ_API_KEY estiver configurada. */
export async function generateBriefingAsync(
  item: RawThreatItem,
  existingSlugs: Set<string>
): Promise<GeneratedBriefing> {
  const base = buildBase(item, existingSlugs);

  const { title, summary, content } = await generateAiBriefing(
    item,
    base.severity,
    base.templateSummary,
    base.templateContent
  );

  return {
    title,
    slug: base.slug,
    summary,
    content,
    severity: base.severity,
    category: base.category,
    tags: base.tags,
    affectedSectors: item.affectedSectors?.length ? item.affectedSectors : ["Geral"],
    affectedRegions: item.affectedRegions?.length ? item.affectedRegions : ["Global"],
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourcePublishedAt: item.publishedAt ?? null,
    iocs: item.iocs ?? [],
    cves: item.cves ?? [],
    mitreTechniques: item.mitreTechniques ?? [],
    epssScore: item.epssScore ?? null,
    cvssScore: item.cvssScore ?? null,
    confidence: base.confidence,
    readingTime: estimateReadingTime(content),
  };
}

/** Versão síncrona — fallback sem IA (mantida para compatibilidade). */
export function generateBriefing(
  item: RawThreatItem,
  existingSlugs: Set<string>
): GeneratedBriefing {
  const base = buildBase(item, existingSlugs);
  return {
    title: item.title,
    slug: base.slug,
    summary: base.templateSummary,
    content: base.templateContent,
    severity: base.severity,
    category: base.category,
    tags: base.tags,
    affectedSectors: item.affectedSectors?.length ? item.affectedSectors : ["Geral"],
    affectedRegions: item.affectedRegions?.length ? item.affectedRegions : ["Global"],
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourcePublishedAt: item.publishedAt ?? null,
    iocs: item.iocs ?? [],
    cves: item.cves ?? [],
    mitreTechniques: item.mitreTechniques ?? [],
    epssScore: item.epssScore ?? null,
    cvssScore: item.cvssScore ?? null,
    confidence: base.confidence,
    readingTime: estimateReadingTime(base.templateContent),
  };
}
