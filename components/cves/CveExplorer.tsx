"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, FilterX, Radar, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import type { CveEntry, VulnType } from "@/lib/cves/fetch-cves";
import { Pagination } from "@/components/ui/Pagination";
import styles from "./cve-explorer.module.css";

interface Props {
  initialCves: CveEntry[];
  initialUpdatedAt: string;
}

type Severity = "" | "CRITICAL" | "HIGH" | "MEDIUM";
type SortMode = "triage" | "epss" | "cvss" | "recent";

const PAGE_SIZE = 12;
const VULN_TYPES: VulnType[] = [
  "Execução de Código", "Injeção", "Estouro de Buffer", "Autenticação",
  "Exposição de Dados", "Travessia de Caminho", "Negação de Serviço",
  "Escalada de Privilégio", "Criptografia", "Outro",
];
const SEV_ORDER: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "há menos de 1h";
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function sortCves(items: CveEntry[], mode: SortMode): CveEntry[] {
  return [...items].sort((a, b) => {
    if (mode === "epss") return (b.epss ?? -1) - (a.epss ?? -1) || (b.cvssScore ?? -1) - (a.cvssScore ?? -1);
    if (mode === "cvss") return (b.cvssScore ?? -1) - (a.cvssScore ?? -1) || (b.epss ?? -1) - (a.epss ?? -1);
    if (mode === "recent") return new Date(b.published).getTime() - new Date(a.published).getTime();
    return Number(b.inCisaKev) - Number(a.inCisaKev)
      || (SEV_ORDER[b.severity ?? ""] ?? -1) - (SEV_ORDER[a.severity ?? ""] ?? -1)
      || (b.epss ?? -1) - (a.epss ?? -1)
      || (b.cvssScore ?? -1) - (a.cvssScore ?? -1);
  });
}

function CveRow({ cve, rank }: { cve: CveEntry; rank: number }) {
  const product = cve.affectedProducts.length
    ? cve.affectedProducts.slice(0, 2).map((value) => value.replaceAll("_", " ")).join(" · ")
    : "Produto não informado no NVD";

  return (
    <Link href={`/cves/${cve.id}`} className={styles.row}>
      <div className={styles.rowRank} aria-hidden>{String(rank).padStart(2, "0")}</div>
      <div className={`${styles.rowScore} ${cve.severity === "CRITICAL" ? styles.rowScoreCritical : ""}`}>
        <strong>{cve.cvssScore?.toFixed(1) ?? "—"}</strong>
        <span>CVSS {cve.cvssVersion || ""}</span>
      </div>
      <div className={styles.rowMain}>
        <div className={styles.rowEyebrow}>
          <span className={styles.rowId}>{cve.id}</span>
          {cve.inCisaKev && <span className={styles.kevBadge}><ShieldAlert size={11} aria-hidden /> CISA KEV</span>}
        </div>
        <h3>{product}</h3>
        <div className={styles.rowMeta}>
          <span className={styles.typeBadge}>{cve.vulnType}</span>
          <span>Publicada {timeAgo(cve.published)}</span>
        </div>
      </div>
      <div className={styles.rowEpss}>
        <span>EPSS</span>
        <strong>{cve.epss == null ? "—" : `${(cve.epss * 100).toFixed(1)}%`}</strong>
        <small>{cve.epssPercentile == null ? "sem dado" : `percentil ${(cve.epssPercentile * 100).toFixed(0)}`}</small>
      </div>
      <span className={styles.rowArrow} aria-hidden><ArrowUpRight size={19} /></span>
    </Link>
  );
}

export default function CveExplorer({ initialCves, initialUpdatedAt }: Props) {
  const [cves, setCves] = useState<CveEntry[]>(initialCves);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<Severity>("");
  const [vulnType, setVulnType] = useState<VulnType | "">("");
  const [kevOnly, setKevOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("triage");
  const [page, setPage] = useState(1);

  const counts = useMemo(() => ({
    critical: cves.filter((cve) => cve.severity === "CRITICAL").length,
    high: cves.filter((cve) => cve.severity === "HIGH").length,
    kev: cves.filter((cve) => cve.inCisaKev).length,
  }), [cves]);

  const filtered = useMemo(() => sortCves(cves.filter((cve) => {
    if (severity && cve.severity !== severity) return false;
    if (vulnType && cve.vulnType !== vulnType) return false;
    if (kevOnly && !cve.inCisaKev) return false;
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return cve.id.toLocaleLowerCase().includes(query)
      || cve.description.toLocaleLowerCase().includes(query)
      || (cve.ptBrDescription ?? "").toLocaleLowerCase().includes(query)
      || cve.affectedProducts.some((product) => product.toLocaleLowerCase().includes(query));
  }), sortMode), [cves, search, severity, vulnType, kevOnly, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasFilters = Boolean(search || severity || vulnType || kevOnly);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const response = await fetch("/api/cves");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { cves: CveEntry[]; updatedAt: string };
      if (!Array.isArray(data.cves) || (data.cves.length === 0 && cves.length > 0)) throw new Error("Coleta vazia");
      setCves(data.cves);
      setUpdatedAt(data.updatedAt);
      setPage(1);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setSeverity("");
    setVulnType("");
    setKevOnly(false);
    setPage(1);
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.heroTopline}><span><Radar size={15} aria-hidden /> STATECRAFT / RADAR DE VULNERABILIDADES</span><span>Monitoramento · NVD / FIRST / CISA</span></div>
        <div className={styles.heroContent}>
          <div>
            <span className={styles.eyebrow}>Inteligência para priorizar</span>
            <h1>Vulnerabilidades<span className={styles.heroPeriod}>.</span></h1>
            <p>Da descoberta à decisão: encontre CVEs recentes, compare os sinais de risco e abra o dossiê técnico de cada uma.</p>
          </div>
          <div className={styles.heroCount}><strong>{cves.length}</strong><span>CVEs na janela<br />de monitoramento</span></div>
        </div>
        <div className={styles.heroBottom}><span className={styles.liveDot} /> Última coleta {updatedAt ? timeAgo(updatedAt) : "indisponível"}<span className={styles.heroBottomDivider} /> Janela de publicação: 7 dias</div>
      </header>

      <div className={styles.metricGrid} aria-label="Resumo das vulnerabilidades">
        <div className={styles.metric}><span>01 / Críticas</span><strong>{counts.critical}</strong><small>Maior severidade técnica</small></div>
        <div className={styles.metric}><span>02 / Altas</span><strong>{counts.high}</strong><small>Requerem avaliação</small></div>
        <div className={styles.metric}><span>03 / CISA KEV</span><strong>{counts.kev}</strong><small>Exploração observada</small></div>
        <div className={styles.metric}><span>04 / Monitoradas</span><strong>{cves.length}</strong><small>Na janela de 7 dias</small></div>
      </div>

      <section className={styles.explorer} aria-labelledby="explorer-title">
        <div className={styles.explorerHead}>
          <div><span className={styles.eyebrow}>Explorar registros</span><h2 id="explorer-title">Fila de triagem</h2></div>
          <p>Use os filtros para encontrar o que afeta seu ambiente.</p>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={18} aria-hidden />
            <label htmlFor="cve-search" className="sr-only">Buscar CVE, produto ou descrição</label>
            <input id="cve-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar CVE, produto ou palavra-chave" autoComplete="off" />
            {search && <button type="button" onClick={() => { setSearch(""); setPage(1); }} aria-label="Limpar busca"><X size={17} aria-hidden /></button>}
          </div>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Atualizar vulnerabilidades" className={styles.refreshButton}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden /> <span>Atualizar</span></button>
        </div>
        {refreshError && <p role="alert" className={styles.refreshError}>Não foi possível atualizar agora. Os resultados anteriores continuam disponíveis.</p>}

        <div className={styles.filterArea}>
          <div className={styles.severityFilters} role="group" aria-label="Filtrar por severidade">
            {([ ["", "Todas"], ["CRITICAL", `Críticas ${counts.critical}`], ["HIGH", `Altas ${counts.high}`], ["MEDIUM", "Médias"] ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={severity === value} className={styles.filterPill} onClick={() => { setSeverity(value); setPage(1); }}>{label}</button>
            ))}
          </div>
          <div className={styles.extraFilters}>
            <button type="button" aria-pressed={kevOnly} className={styles.kevFilter} onClick={() => { setKevOnly(!kevOnly); setPage(1); }}><ShieldAlert size={14} aria-hidden /> CISA KEV <span>{counts.kev}</span></button>
            <label className="sr-only" htmlFor="cve-type">Tipo de vulnerabilidade</label>
            <select id="cve-type" value={vulnType} onChange={(event) => { setVulnType(event.target.value as VulnType | ""); setPage(1); }}>
              <option value="">Todos os tipos</option>
              {VULN_TYPES.filter((type) => cves.some((cve) => cve.vulnType === type)).map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.resultsHead}>
          <div><span className={styles.resultCount}>{filtered.length}</span> resultado{filtered.length === 1 ? "" : "s"}{hasFilters && <button type="button" onClick={clearFilters} className={styles.clearButton}><FilterX size={13} aria-hidden /> Limpar filtros</button>}</div>
          <label>Ordenar por <select value={sortMode} onChange={(event) => { setSortMode(event.target.value as SortMode); setPage(1); }} aria-label="Ordenar vulnerabilidades"><option value="triage">Triagem</option><option value="epss">Maior EPSS</option><option value="cvss">Maior CVSS</option><option value="recent">Mais recentes</option></select></label>
        </div>

        {filtered.length === 0 ? <div className={styles.emptyState}><Radar size={25} aria-hidden /><h3>{hasFilters ? "Nenhum resultado nesta combinação" : "Nenhuma CVE disponível"}</h3><p>{hasFilters ? "Ajuste os termos ou remova os filtros para ampliar a busca." : "A coleta ainda não retornou vulnerabilidades para esta janela."}</p>{hasFilters && <button type="button" onClick={clearFilters}>Limpar filtros <ArrowRight size={14} aria-hidden /></button>}</div> : <div className={styles.list}>
          {pageItems.map((cve, index) => <CveRow key={cve.id} cve={cve} rank={(safePage - 1) * PAGE_SIZE + index + 1} />)}
        </div>}

        <Pagination page={safePage} totalPages={totalPages} onPage={(number) => { setPage(number); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-8" />
      </section>

      <footer className={styles.footnote}><p>CVSS expressa severidade técnica; EPSS estima a probabilidade de exploração nos 30 dias seguintes à data do score. O catálogo CISA KEV registra vulnerabilidades com exploração observada.</p><a href="https://nvd.nist.gov/vuln/search" target="_blank" rel="noopener noreferrer">Consultar base completa no NVD <ArrowUpRight size={15} aria-hidden /></a></footer>
    </div>
  );
}
