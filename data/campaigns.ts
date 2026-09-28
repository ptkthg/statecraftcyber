export interface Campaign {
  slug: string;
  title: string;
  actor: string;
  status: string;
  reviewedAt: string;
  period: string;
  summary: string;
  impact: string;
  sectors: string[];
  matchTerms: string[];
  cves: { id: string; context: string }[];
  techniques: { id: string; name: string }[];
  indicators: { type: string; value: string; context: string; source: string }[];
  timeline: { date: string; event: string; source: string }[];
  actions: string[];
  sources: { name: string; url: string; date: string }[];
}

const GOOGLE_ORACLE = "https://cloud.google.com/blog/topics/threat-intelligence/shinyhunters-renewed-mass-exploitation-campaign-targeting-oracle-peoplesoft";
const MICROSOFT_AZURE = "https://www.microsoft.com/en-us/security/blog/2026/09/25/storm-3168-agentic-driven-cloud-attacks-using-compromised-service-principals/";
const MITRE_TEAMPCP = "https://attack.mitre.org/groups/G1056/";
const GOOGLE_SUPPLY = "https://cloud.google.com/blog/topics/threat-intelligence/mitigation-guidance-for-supply-chain-compromise";

export const campaigns: Campaign[] = [
  {
    slug: "unc6240-oracle-peoplesoft",
    title: "Exploração do Oracle PeopleSoft",
    actor: "UNC6240 / ShinyHunters",
    status: "Em acompanhamento",
    reviewedAt: "2026-09-28",
    period: "Maio–setembro de 2026",
    summary: "O Google Threat Intelligence Group descreve uma nova onda de exploração do Oracle PeopleSoft por UNC6240, com desvio de regras de WAF, implantação de web shells e preparação para exfiltração.",
    impact: "Instâncias PeopleSoft expostas podem permitir acesso inicial e persistência; a exposição real depende da configuração e das correções aplicadas.",
    sectors: ["Múltiplos setores", "Organizações com PeopleSoft"],
    matchTerms: ["UNC6240", "CVE-2026-35273", "PeopleSoft ShinyHunters"],
    cves: [{ id: "CVE-2026-35273", context: "Vulnerabilidade explorada nesta campanha, segundo o Google." }],
    techniques: [
      { id: "T1190", name: "Exploração de aplicação exposta" },
      { id: "T1505.003", name: "Web shell" },
    ],
    indicators: [
      { type: "IP", value: "5.199.162.157", context: "Infraestrutura de varredura e controle relatada pelo Google.", source: GOOGLE_ORACLE },
      { type: "IP", value: "104.219.234.138", context: "Infraestrutura de preparação para exfiltração relatada pelo Google.", source: GOOGLE_ORACLE },
    ],
    timeline: [
      { date: "Mai–jun 2026", event: "Primeira atividade de exploração observada pelo Google.", source: GOOGLE_ORACLE },
      { date: "Set 2026", event: "Nova onda com variantes de URL e web shells.", source: GOOGLE_ORACLE },
      { date: "25 set 2026", event: "Google publica a análise atualizada.", source: GOOGLE_ORACLE },
    ],
    actions: ["Aplicar a correção da Oracle para CVE-2026-35273.", "Revisar acessos ao EMHub, variantes codificadas de URL e arquivos JSP inesperados.", "Investigar sinais de persistência e exfiltração antes de encerrar o incidente."],
    sources: [{ name: "Google Threat Intelligence Group — análise da campanha", url: GOOGLE_ORACLE, date: "25 set 2026" }],
  },
  {
    slug: "storm-3168-azure",
    title: "Operações destrutivas no Azure",
    actor: "Storm-3168 / JADEPUFFER",
    status: "Em acompanhamento",
    reviewedAt: "2026-09-28",
    period: "Junho–setembro de 2026",
    summary: "A Microsoft relata o uso de identidades de serviço comprometidas para descobrir recursos no Azure e executar ações destrutivas em ambientes de nuvem.",
    impact: "Risco de perda de dados e comprometimento de mecanismos de recuperação quando permissões excessivas e credenciais vazadas se combinam.",
    sectors: ["Ambientes Azure", "Equipes de infraestrutura"],
    matchTerms: ["Storm-3168", "JADEPUFFER"],
    cves: [],
    techniques: [
      { id: "T1078.004", name: "Contas de nuvem válidas" },
      { id: "T1526", name: "Descoberta de serviços de nuvem" },
      { id: "T1485", name: "Destruição de dados" },
    ],
    indicators: [
      { type: "IP", value: "45.131.66.106", context: "Indicador de rede publicado pela Microsoft.", source: MICROSOFT_AZURE },
      { type: "IP", value: "34.153.223.102", context: "Indicador de rede publicado pela Microsoft.", source: MICROSOFT_AZURE },
    ],
    timeline: [
      { date: "Jun 2026", event: "Microsoft observa operações com duas identidades de serviço comprometidas.", source: MICROSOFT_AZURE },
      { date: "25 set 2026", event: "Microsoft publica a investigação sobre Storm-3168.", source: MICROSOFT_AZURE },
    ],
    actions: ["Rotacionar segredos expostos e revisar identidades de serviço.", "Reduzir permissões no Azure ao mínimo necessário.", "Proteger backups e investigar exclusões, alterações de bloqueios e atividades anômalas."],
    sources: [{ name: "Microsoft Security Blog — investigação de Storm-3168", url: MICROSOFT_AZURE, date: "25 set 2026" }],
  },
  {
    slug: "teampcp-cadeia-suprimentos",
    title: "Comprometimento da cadeia de software",
    actor: "TeamPCP",
    status: "Em acompanhamento",
    reviewedAt: "2026-09-28",
    period: "Fevereiro–julho de 2026",
    summary: "O Google e o MITRE documentam campanhas atribuídas a TeamPCP que atingiram pacotes e fluxos de CI/CD para roubar credenciais e ampliar o acesso a ambientes de nuvem.",
    impact: "Dependências e automações contaminadas podem expor segredos usados em builds, repositórios e infraestrutura de nuvem.",
    sectors: ["Desenvolvimento de software", "CI/CD", "Ambientes de nuvem"],
    matchTerms: ["TeamPCP", "UNC6780", "Mini Shai-Hulud"],
    cves: [],
    techniques: [
      { id: "T1195.001", name: "Comprometimento de dependências de software" },
      { id: "T1555.006", name: "Credenciais em repositórios de nuvem" },
    ],
    indicators: [],
    timeline: [
      { date: "Fev–mai 2026", event: "Atividade em ecossistemas de pacotes e automações de CI/CD documentada pelo Google.", source: GOOGLE_SUPPLY },
      { date: "Jul 2026", event: "Google publica recomendações para o comprometimento da cadeia de software.", source: GOOGLE_SUPPLY },
    ],
    actions: ["Auditar versões de dependências e execuções recentes de CI/CD.", "Revogar e rotacionar segredos acessíveis aos pipelines afetados.", "Restringir permissões de publicação de pacotes e de workflows."],
    sources: [
      { name: "Google Threat Intelligence Group — orientação de mitigação", url: GOOGLE_SUPPLY, date: "30 jul 2026" },
      { name: "MITRE ATT&CK — TeamPCP (G1056)", url: MITRE_TEAMPCP, date: "2026" },
    ],
  },
];

export function mentionsCampaign(text: string, campaign: Campaign): boolean {
  return campaign.matchTerms.some((term) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
}
