import type { RawIOC } from "./threat-sources/types";

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|gov|br|ru|cn|info|biz|xyz|top|cc|tk|pw|ga|ml|cf|gq)\b/gi;
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const SHA256_RE = /\b[0-9a-f]{64}\b/gi;
const MD5_RE = /\b[0-9a-f]{32}\b/gi;
const URL_RE = /https?:\/\/[^\s"'<>]+/g;

const PRIVATE_IP_RE = /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/;

// IPs legítimos conhecidos (evitar falsos positivos)
const ALLOWLISTED_DOMAINS = new Set([
  "google.com", "microsoft.com", "github.com", "amazon.com",
  "cloudflare.com", "jsdelivr.net", "unpkg.com", "googleapis.com",
]);

/**
 * Extrai IOCs de texto livre. Usado como complemento aos IOCs estruturados.
 * Não deve ser a fonte primária — preferir dados estruturados das APIs.
 */
export function extractIocsFromText(
  text: string,
  sourceName: string
): RawIOC[] {
  const iocs: RawIOC[] = [];

  // IPs (excluindo privados)
  for (const match of text.matchAll(IP_RE)) {
    if (!PRIVATE_IP_RE.test(match[0])) {
      iocs.push({ type: "ip", value: match[0], confidence: "low", source: sourceName });
    }
  }

  // Domínios (excluindo allowlist)
  for (const match of text.matchAll(DOMAIN_RE)) {
    const domain = match[0].toLowerCase();
    if (!ALLOWLISTED_DOMAINS.has(domain)) {
      iocs.push({ type: "domain", value: domain, confidence: "low", source: sourceName });
    }
  }

  // SHA256
  for (const match of text.matchAll(SHA256_RE)) {
    iocs.push({ type: "hash", value: match[0].toLowerCase(), confidence: "medium", source: sourceName });
  }

  // MD5 (menor confiança, muitos falsos positivos)
  for (const match of text.matchAll(MD5_RE)) {
    iocs.push({ type: "hash", value: match[0].toLowerCase(), confidence: "low", source: sourceName });
  }

  return dedupeIocs(iocs);
}

/** Combina e deduplicar listas de IOCs. */
export function mergeIocs(a: RawIOC[], b: RawIOC[]): RawIOC[] {
  return dedupeIocs([...a, ...b]);
}

function dedupeIocs(iocs: RawIOC[]): RawIOC[] {
  const seen = new Set<string>();
  return iocs.filter((ioc) => {
    const key = `${ioc.type}:${ioc.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Extrai CVEs de texto livre (complemento). */
export function extractCvesFromText(text: string): string[] {
  const matches = text.match(CVE_RE) ?? [];
  return [...new Set(matches.map((c) => c.toUpperCase()))];
}
