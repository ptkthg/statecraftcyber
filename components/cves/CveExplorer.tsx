"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import type { CvePage } from "@/lib/cves/query";
import { operationalPriority, technicalSummary } from "@/lib/cves/assessment";
import { getCveRowTitle } from "@/lib/cves/row-title";
import { Pagination } from "@/components/ui/Pagination";
import styles from "./cve-explorer.module.css";
const defaultFilters = {
  q: "",
  severity: "",
  cvssMin: "",
  cvssMax: "",
  epssMin: "",
  epssMax: "",
  kev: "",
  product: "",
  type: "",
  from: "",
  to: "",
  analysis: "",
  sort: "priority",
};
type Filters = typeof defaultFilters;
const date = (v: string | null | undefined) =>
  v && Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : "não informada";
const severityLabel: Record<string, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  NONE: "Nenhuma",
};
export default function CveExplorer({
  initialData,
  initialQuery = "",
}: {
  initialData: CvePage;
  initialQuery?: string;
}) {
  const [data, setData] = useState(initialData),
    [filters, setFilters] = useState<Filters>(() => {
      const p = new URLSearchParams(initialQuery);
      return Object.fromEntries(
        Object.entries(defaultFilters).map(([k, v]) => [k, p.get(k) ?? v]),
      ) as Filters;
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    applied = useRef(filters),
    resultRef = useRef<HTMLDivElement>(null);
  const update = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  async function load(next: Filters, page = 1) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next))
      if (value) params.set(key, value);
    params.set("page", String(page));
    try {
      const response = await fetch("/api/cves?" + params, {
        signal: active.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Não foi possível consultar.");
      if (active.signal.aborted) return;
      setData(body as CvePage);
      applied.current = next;
      window.history.replaceState(null, "", "/cves?" + params + "#radar-cves");
    } catch (e) {
      if (!active.signal.aborted)
        setError(e instanceof Error ? e.message : "Consulta indisponível.");
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void load(filters);
  }
  return (
    <div className={styles.wrap}>
      <header className={styles.explorerHead}>
        <div>
          <span className={styles.eyebrow}>Inteligência para priorizar</span>
          <h2>Fila de triagem</h2>
        </div>
        <p>
          Última coleta: {date(data.updatedAt)} · {data.total} registros nesta
          consulta
        </p>
      </header>
      <form
        onSubmit={submit}
        className={styles.explorer}
        aria-label="Filtros do radar de CVEs"
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={18} aria-hidden />
            <label htmlFor="cve-search" className="sr-only">
              Buscar identificador ou descrição
            </label>
            <input
              id="cve-search"
              name="q"
              type="search"
              value={filters.q}
              onChange={(e) => update("q", e.target.value)}
              placeholder="CVE, produto ou palavra-chave"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => load(applied.current, data.page)}
            className={styles.refreshButton}
          >
            <RefreshCw
              size={16}
              aria-hidden
              className={busy ? "animate-spin" : ""}
            />
            <span>Consultar</span>
          </button>
        </div>
        <div className={styles.advancedFilters}>
          <label>
            Severidade
            <select
              value={filters.severity}
              onChange={(e) => update("severity", e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(severityLabel).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
              <option value="UNKNOWN">Não informada</option>
            </select>
          </label>
          <label>
            Fabricante ou produto
            <input
              value={filters.product}
              onChange={(e) => update("product", e.target.value)}
              placeholder="Ex.: Microsoft, OpenSSL"
            />
          </label>
          <label>
            Tipo de vulnerabilidade
            <select
              value={filters.type}
              onChange={(e) => update("type", e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {data.types.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            CISA KEV
            <select
              value={filters.kev}
              onChange={(e) => update("kev", e.target.value)}
            >
              <option value="">Todos os estados</option>
              <option value="yes">Catalogada</option>
              <option value="no">Não catalogada na consulta</option>
            </select>
          </label>
          <fieldset>
            <legend>CVSS · 0 a 10</legend>
            <div>
              <label className="sr-only" htmlFor="cvss-min">
                CVSS mínimo
              </label>
              <input
                id="cvss-min"
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="Mínimo"
                value={filters.cvssMin}
                onChange={(e) => update("cvssMin", e.target.value)}
              />
              <span>a</span>
              <label className="sr-only" htmlFor="cvss-max">
                CVSS máximo
              </label>
              <input
                id="cvss-max"
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="Máximo"
                value={filters.cvssMax}
                onChange={(e) => update("cvssMax", e.target.value)}
              />
            </div>
          </fieldset>
          <fieldset>
            <legend>EPSS · 0 a 100%</legend>
            <div>
              <label className="sr-only" htmlFor="epss-min">
                EPSS mínimo em porcentagem
              </label>
              <input
                id="epss-min"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Mínimo %"
                value={filters.epssMin}
                onChange={(e) => update("epssMin", e.target.value)}
              />
              <span>a</span>
              <label className="sr-only" htmlFor="epss-max">
                EPSS máximo em porcentagem
              </label>
              <input
                id="epss-max"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Máximo %"
                value={filters.epssMax}
                onChange={(e) => update("epssMax", e.target.value)}
              />
            </div>
          </fieldset>
          <label>
            Publicada a partir de
            <input
              type="date"
              value={filters.from}
              onChange={(e) => update("from", e.target.value)}
            />
          </label>
          <label>
            Publicada até
            <input
              type="date"
              value={filters.to}
              onChange={(e) => update("to", e.target.value)}
            />
          </label>
          <label>
            Análise enriquecida
            <select
              value={filters.analysis}
              onChange={(e) => update("analysis", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="yes">Com análise validada</option>
              <option value="no">Sem análise validada</option>
            </select>
          </label>
          <label>
            Ordenar por
            <select
              value={filters.sort}
              onChange={(e) => update("sort", e.target.value)}
            >
              <option value="priority">Prioridade operacional</option>
              <option value="cvss">Maior CVSS</option>
              <option value="epss">Maior EPSS</option>
              <option value="recent">Publicação mais recente</option>
            </select>
          </label>
        </div>
        <div className={styles.filterActions}>
          <button type="submit" disabled={busy}>
            Aplicar filtros
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setFilters(defaultFilters);
              void load(defaultFilters);
            }}
          >
            Limpar filtros
          </button>
          <a href="#priorizacao-cves">Como priorizamos</a>
        </div>
      </form>
      {error && (
        <p role="alert" className={styles.refreshError}>
          {error} Os resultados anteriores foram preservados.
        </p>
      )}
      <div ref={resultRef} className={styles.resultsHead} aria-live="polite">
        <p>
          {busy
            ? "Consultando fontes e registros…"
            : `${data.total} resultados · página ${data.page} de ${data.totalPages}`}
        </p>
      </div>
      <div className={styles.list} aria-busy={busy}>
        {data.cves.length ? (
          data.cves.map((cve, index) => {
            const priority = operationalPriority(cve),
              meta = cve.sourceMetadata;
            return (
              <Link
                href={"/cves/" + cve.id}
                key={cve.id}
                className={styles.row}
              >
                <span className={styles.rowRank} aria-hidden>
                  {String((data.page - 1) * data.limit + index + 1).padStart(
                    2,
                    "0",
                  )}
                </span>
                <div
                  className={`${styles.rowScore} ${cve.severity === "CRITICAL" ? styles.rowScoreCritical : ""}`}
                >
                  <strong>{cve.cvssScore?.toFixed(1) ?? "—"}</strong>
                  <span>CVSS {cve.cvssVersion || "s/d"}</span>
                </div>
                <div className={styles.rowMain}>
                  <div className={styles.rowEyebrow}>
                    <span className={styles.rowId}>{cve.id}</span>
                    <span className={styles.severityText}>
                      {severityLabel[cve.severity ?? ""] ?? "Sem severidade"}
                    </span>
                    {cve.inCisaKev && (
                      <span className={styles.kevBadge}>CISA KEV</span>
                    )}
                  </div>
                  <h3>
                    {cve.affectedProducts.length
                      ? getCveRowTitle(cve)
                      : cve.vulnType !== "Outro"
                        ? cve.vulnType + (cve.cweId ? " · " + cve.cweId : "")
                        : "Ficha técnica · " + cve.id}
                  </h3>
                  <p className={styles.rowSummary}>{technicalSummary(cve)}</p>
                  <div className={styles.rowMeta}>
                    <span>{cve.vulnType}</span>
                    <span>Publicada {date(cve.published)}</span>
                    <span>Atualizada {date(cve.lastModified)}</span>
                  </div>
                  <p className={styles.priorityLabel}>
                    {priority.label} ·{" "}
                    {meta?.references.some((r) => r.tags.includes("Exploit"))
                      ? "Referência de exploit documentada"
                      : cve.inCisaKev
                        ? "Exploração reportada no KEV"
                        : "Exploração ativa não confirmada nesta ficha"}
                  </p>
                </div>
                <div className={styles.rowEpss}>
                  <span>EPSS</span>
                  <strong>
                    {cve.epss === null
                      ? "—"
                      : (cve.epss * 100).toFixed(2) + "%"}
                  </strong>
                  <small>Score: {date(meta?.epss.date)}</small>
                  <small>
                    {meta?.kev.status == null && !cve.inCisaKev
                      ? "KEV não verificado"
                      : ""}
                  </small>
                </div>
                <ArrowUpRight
                  size={18}
                  className={styles.rowArrow}
                  aria-hidden
                />
              </Link>
            );
          })
        ) : (
          <div className={styles.emptyState}>
            <h3>Nenhum resultado nesta combinação</h3>
            <p>
              Ajuste os filtros. Dados ausentes não são tratados como pontuação
              zero.
            </p>
          </div>
        )}
      </div>
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        onPage={(page) => {
          if (!busy)
            void load(applied.current, page).then(() =>
              resultRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }),
            );
        }}
      />
      <p className={styles.footnote}>
        {data.coverage} Abra a ficha para consultar as fontes e o estado de cada
        métrica.
      </p>
      <section id="priorizacao-cves" className={styles.priorityMethod}>
        <span className={styles.eyebrow}>Método operacional · regras v1</span>
        <h2>Prioridade com critérios visíveis</h2>
        <p>
          As regras são aplicadas em ordem. Não calculamos uma soma de
          indicadores. A exposição do seu ambiente, a criticidade do ativo e os
          controles locais precisam de avaliação própria.
        </p>
        <ol>
          <li>
            <strong>P1:</strong> presença reportada no CISA KEV.
          </li>
          <li>
            <strong>P2:</strong> referência marcada como Exploit no NVD, ou CVSS
            ≥ 9 com EPSS ≥ 10%.
          </li>
          <li>
            <strong>P3:</strong> CVSS ≥ 7 ou EPSS ≥ 10%.
          </li>
          <li>
            <strong>P4:</strong> dados disponíveis abaixo dos limiares
            anteriores.
          </li>
          <li>
            <strong>Dados insuficientes:</strong> ausência de CVSS e EPSS, sem
            sinais anteriores.
          </li>
        </ol>
        <p>
          O limiar de EPSS de 10% é uma escolha operacional explícita da
          Statecraft, não uma categoria oficial do FIRST. EPSS estima a
          probabilidade nos próximos 30 dias a partir da data do score; não
          confirma exploração. CVSS mede severidade técnica. Referências de
          exploit e relatos do KEV são apresentados com suas respectivas fontes.
        </p>
      </section>
    </div>
  );
}
