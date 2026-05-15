import { createHash } from "crypto";
import type { RawThreatItem } from "./threat-sources/types";

/**
 * Gera um hash de conteúdo para deduplicação.
 * Combina externalId + sourceName + CVEs para criar uma impressão digital estável.
 */
export function generateContentHash(item: RawThreatItem): string {
  const cves = [...(item.cves ?? [])].sort().join("|");
  const key = `${item.externalId}::${item.sourceName}::${cves}`;
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Dado um conjunto de itens, filtra aqueles cujos hashes já existem no banco.
 */
export function filterNewItems(
  items: RawThreatItem[],
  existingHashes: Set<string>
): { item: RawThreatItem; hash: string }[] {
  const seen = new Set<string>();
  const result: { item: RawThreatItem; hash: string }[] = [];

  for (const item of items) {
    const hash = generateContentHash(item);

    // Deduplicar dentro do próprio batch
    if (seen.has(hash)) continue;
    seen.add(hash);

    // Verificar se já existe no banco
    if (existingHashes.has(hash)) continue;

    result.push({ item, hash });
  }

  return result;
}

/**
 * Gera um slug URL-safe a partir de um título.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Remove acentos
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/**
 * Garante unicidade do slug, adicionando sufixo numérico se necessário.
 */
export function ensureUniqueSlug(
  base: string,
  existingSlugs: Set<string>
): string {
  if (!existingSlugs.has(base)) return base;

  let i = 2;
  while (existingSlugs.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
