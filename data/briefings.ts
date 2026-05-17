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

