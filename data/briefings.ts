export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "Malware" | "Ransomware" | "Atores de Ameaça" | "Vulnerabilidades" | "APT" | "Phishing" | "Supply Chain";
export type Region = "Global" | "LATAM" | "APAC" | "Europa" | "América do Norte" | "Oriente Médio";
export type Sector = "Financeiro" | "Saúde" | "Governo" | "Energia" | "Tecnologia" | "Manufatura";

export interface Briefing {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  category: Category;
  severity: Severity;
  region: Region;
  sector?: Sector;
  date: string;
  readingTime: number;
  featured?: boolean;
  tags: string[];
  author: string;
  iocs?: string[];
}

export const briefings: Briefing[] = [
  {
    id: "1",
    title: "FINTR mira instituições financeiras no Brasil com novo vetor de phishing",
    summary: "O grupo FINTR intensificou campanhas contra bancos e fintechs brasileiras utilizando páginas falsas de portais bancários com coleta avançada de credenciais e bypass de autenticação multifator via AiTM.",
    category: "Phishing",
    severity: "critical",
    region: "LATAM",
    sector: "Financeiro",
    date: "2026-05-13",
    readingTime: 8,
    featured: true,
    tags: ["AiTM", "Credential Harvesting", "MFA Bypass", "Banking"],
    author: "Equipe Statecraft",
    iocs: ["185.220.101.45", "phish-secure-banco[.]com", "7a3f9c2d4e..."],
  },
  {
    id: "2",
    title: "Operação de Espionagem UNC3884: Atividade Migratória para o Pacífico",
    summary: "O ator de ameaça UNC3884, vinculado a interesses estatais, expandiu operações para infraestruturas críticas na região do Pacífico utilizando malware customizado e técnicas de living-off-the-land.",
    category: "APT",
    severity: "high",
    region: "APAC",
    sector: "Governo",
    date: "2026-05-12",
    readingTime: 12,
    featured: false,
    tags: ["APT", "Living-off-the-land", "Espionagem", "Infraestrutura Crítica"],
    author: "Statecraft Labs",
  },
  {
    id: "3",
    title: "Alerta: Ransomware Qlin move para o Setor de Saúde",
    summary: "O ransomware Qlin identificou hospitais e operadoras de saúde como alvos prioritários, com TTPs evoluídas incluindo exfiltração dupla e publicação em data leak sites dedicados ao setor.",
    category: "Ransomware",
    severity: "critical",
    region: "Global",
    sector: "Saúde",
    date: "2026-05-11",
    readingTime: 6,
    featured: false,
    tags: ["Ransomware", "Double Extortion", "Healthcare", "Qlin"],
    author: "Equipe Statecraft",
  },
  {
    id: "4",
    title: "Análise Evolutiva do Trojan de Acesso Remoto DarkSky",
    summary: "Nova variante do RAT DarkSky incorpora módulo de evasão baseado em análise de comportamento de sandbox e mecanismo de persistência via COM Object hijacking.",
    category: "Malware",
    severity: "high",
    region: "Europa",
    sector: "Tecnologia",
    date: "2026-05-10",
    readingTime: 10,
    featured: false,
    tags: ["RAT", "Sandbox Evasion", "COM Hijacking", "Persistence"],
    author: "Statecraft Labs",
  },
  {
    id: "5",
    title: "CVE-2026-1337: Vulnerabilidade Crítica em VPNs Corporativas",
    summary: "Vulnerabilidade de execução remota de código em dispositivos VPN afeta mais de 40.000 instalações globais. Exploit público disponível; patches emergenciais devem ser aplicados imediatamente.",
    category: "Vulnerabilidades",
    severity: "critical",
    region: "Global",
    date: "2026-05-09",
    readingTime: 5,
    featured: false,
    tags: ["CVE", "RCE", "VPN", "Patch Urgente"],
    author: "Equipe Statecraft",
  },
  {
    id: "6",
    title: "Grupo Lazarus intensifica operações de supply chain contra desenvolvedores",
    summary: "O Lazarus Group distribuiu pacotes npm maliciosos que roubam credenciais e chaves de criptomoedas de desenvolvedores, com mais de 2.500 downloads antes da remoção.",
    category: "Supply Chain",
    severity: "high",
    region: "Global",
    sector: "Tecnologia",
    date: "2026-05-08",
    readingTime: 9,
    featured: false,
    tags: ["Lazarus", "npm", "Supply Chain", "Crypto"],
    author: "Statecraft Labs",
  },
  {
    id: "7",
    title: "Campanha de Desinformação Ligada a Atores Estatais Mira Eleições na LATAM",
    summary: "Infraestrutura de desinformação coordenada detectada operando em pelo menos 6 países da América Latina, utilizando IA generativa para produção de conteúdo em escala e amplificação via redes sociais comprometidas.",
    category: "Atores de Ameaça",
    severity: "medium",
    region: "LATAM",
    date: "2026-05-07",
    readingTime: 11,
    featured: false,
    tags: ["Desinformação", "IA Generativa", "Influência", "Eleições"],
    author: "Equipe Statecraft",
  },
  {
    id: "8",
    title: "SCYTHE: Nova Regras Sigma para Detecção de Movimentação Lateral",
    summary: "Statecraft Labs publica conjunto de 47 regras Sigma cobrindo técnicas de movimentação lateral documentadas no MITRE ATT&CK, com validação em ambientes Windows e Linux.",
    category: "Malware",
    severity: "medium",
    region: "Global",
    date: "2026-05-06",
    readingTime: 7,
    featured: false,
    tags: ["Sigma", "Lateral Movement", "MITRE ATT&CK", "Detection"],
    author: "Statecraft Labs",
  },
];

export const threatIndicators = [
  { type: "IP", value: "185.220.101.45", threat: "C2", severity: "critical" as Severity },
  { type: "Domain", value: "update-win32[.]net", threat: "Malware Distribution", severity: "critical" as Severity },
  { type: "Hash", value: "a3f7c9d2e4b8...", threat: "Ransomware", severity: "high" as Severity },
  { type: "URL", value: "phish-portal[.]xyz/login", threat: "Phishing", severity: "high" as Severity },
  { type: "IP", value: "91.242.217.100", threat: "Botnet", severity: "medium" as Severity },
  { type: "Domain", value: "cdn-secure-js[.]org", threat: "Supply Chain", severity: "medium" as Severity },
];

export const trendingThreats = [
  { name: "Ransomware Qlin", change: "+34%", severity: "critical" as Severity },
  { name: "FINTR Phishing Kit", change: "+28%", severity: "critical" as Severity },
  { name: "DarkSky RAT v3", change: "+19%", severity: "high" as Severity },
  { name: "CVE-2026-1337", change: "+45%", severity: "critical" as Severity },
  { name: "Supply Chain npm", change: "+12%", severity: "high" as Severity },
];
