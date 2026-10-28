import type { ReactNode, CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { campaigns } from "@/data/campaigns";
import { getCveDetail, normalizeCveId } from "@/lib/cves/get-cve-detail";
import {
  operationalPriority,
  technicalSummary,
  versionRange,
} from "@/lib/cves/assessment";
import { vectorConditions } from "@/lib/cves/vector";
import { relatedCveEvidence } from "@/lib/cves/relationships";
import styles from "./cve-detail.module.css";
type Props = { params: Promise<{ id: string }> };
const labels: Record<string, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  NONE: "Nenhuma",
};
const date = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : "Não informada";
const sections = [
  "Visão geral",
  "Métricas e exploração",
  "Produtos e versões afetados",
  "Descrição e análise técnica",
  "Impacto e condições de exploração",
  "Remediação e mitigação",
  "Referências e vínculos relacionados",
];
function Section({ n, children }: { n: number; children: ReactNode }) {
  const number = String(n).padStart(2, "0");
  return (
    <section
      id={"secao-" + number}
      aria-labelledby={"titulo-" + number}
      className={styles.section}
    >
      <header className={styles.sectionHead}>
        <span className={styles.sectionNumber} aria-hidden>
          {number}
        </span>
        <div>
          <span className={styles.eyebrow}>Dossiê técnico / {number}</span>
          <h2 id={"titulo-" + number}>{sections[n - 1]}</h2>
        </div>
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.sourceLink}
    >
      <span>{children}</span>
      <ArrowUpRight size={15} aria-hidden />
    </a>
  );
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = normalizeCveId((await params).id);
  return id
    ? {
        title: id + " | Statecraft Cyber Intelligence",
        description:
          "Ficha de vulnerabilidade: métricas, exposição, evidências e referências de " +
          id,
      }
    : {};
}
export default async function CveDetailPage({ params }: Props) {
  const id = normalizeCveId((await params).id);
  if (!id) notFound();
  const cve = await getCveDetail(id);
  if (!cve)
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <Link href="/cves" className={styles.backLink}>
            <ArrowLeft size={15} aria-hidden />
            Voltar ao radar
          </Link>
          <header className={styles.hero}>
            <span className={styles.eyebrow}>Registro indisponível</span>
            <h1 className={styles.heroTitle}>{id}</h1>
            <p className={styles.leadText}>
              Não foi possível consultar esta ficha. O registro pode estar
              indisponível ou ainda não estar presente nas fontes.
            </p>
            <Source href={"https://nvd.nist.gov/vuln/detail/" + id}>
              Consultar no NVD
            </Source>
          </header>
        </div>
      </main>
    );
  const metadata = cve.sourceMetadata,
    priority = operationalPriority(cve),
    related = await relatedCveEvidence(id),
    linkedCampaigns = campaigns.filter(
      (c) => c.cves.some((v) => v.id === id) && c.sources.length > 0,
    ),
    conditions = vectorConditions(metadata?.nvd.vector),
    advisories =
      metadata?.references.filter((r) => r.tags.includes("Vendor Advisory")) ??
      [],
    fixReferences =
      metadata?.references.filter(
        (r) => r.tags.includes("Patch") || r.tags.includes("Mitigation"),
      ) ?? [],
    exploits =
      metadata?.references.filter((r) => r.tags.includes("Exploit")) ?? [],
    rejected = metadata?.nvd.status === "Rejected";
  const style = {
    "--score-fill": `${(cve.cvssScore ?? 0) * 10}%`,
  } as CSSProperties;
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav aria-label="Navegação da ficha" className={styles.breadcrumb}>
          <Link href="/cves" className={styles.backLink}>
            <ArrowLeft size={14} aria-hidden />
            Vulnerabilidades
          </Link>
          <ChevronRight size={12} aria-hidden />
          <span aria-current="page">{id}</span>
        </nav>
        <header className={styles.hero}>
          <div className={styles.heroTopline}>
            <span>Statecraft / Dossiê técnico</span>
            <span>NVD · FIRST · CISA</span>
          </div>
          <div className={styles.heroContent}>
            <div>
              <div className={styles.statusLine}>
                <span className={styles.statusPill}>
                  {rejected
                    ? "Registro rejeitado na fonte"
                    : cve.ptBrDescription
                      ? "Análise validada automaticamente"
                      : "Ficha de dados das fontes"}
                </span>
                {cve.inCisaKev && (
                  <span className={styles.kevPill}>
                    Exploração reportada · CISA KEV
                  </span>
                )}
              </div>
              <p className={styles.eyebrow}>Identificador / NVD</p>
              <h1 className={styles.heroTitle}>{id}</h1>
              <p className={styles.productLine}>
                {cve.affectedProducts.length
                  ? cve.affectedProducts
                      .slice(0, 3)
                      .map((p) => p.replaceAll("_", " "))
                      .join(" · ")
                  : "Fabricante e produto não informados"}
              </p>
              <div className={styles.dates}>
                <span>PUBLICADA {date(cve.published)}</span>
                <span>ATUALIZADA {date(cve.lastModified)}</span>
              </div>
            </div>
            <div
              className={styles.scorePanel}
              data-severity={cve.severity ?? "UNKNOWN"}
            >
              <div className={styles.scoreCenter}>
                <strong>{cve.cvssScore?.toFixed(1) ?? "—"}</strong>
                <span className={styles.scoreScale}>/ 10</span>
                <span className={styles.scoreVersion}>
                  CVSS {cve.cvssVersion || "não informado"}
                </span>
              </div>
              <div className={styles.scoreTrack} style={style} aria-hidden>
                <span />
              </div>
              <span className={styles.scoreCaption}>
                {labels[cve.severity ?? ""] ?? "Severidade não informada"}
              </span>
            </div>
          </div>
          <div className={styles.heroFooter}>
            <span>{cve.cweId || "CWE não informada"}</span>
            <span>Consulta NVD: {date(cve.fetchedAt)}</span>
            <a href={cve.nvdUrl} target="_blank" rel="noopener noreferrer">
              Registro original <ExternalLink size={14} aria-hidden />
            </a>
          </div>
        </header>
        {(cve.dataState === "stale" ||
          rejected ||
          !!metadata?.warnings.length) && (
          <div className={styles.dataNotice} role="note">
            <strong>
              {rejected
                ? "Esta CVE foi rejeitada na fonte."
                : cve.dataState === "stale"
                  ? "Consulta atual indisponível; exibindo o último registro armazenado."
                  : "Limitações das fontes"}
            </strong>
            {metadata?.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            {cve.dataState === "stale" && (
              <p>
                EPSS foi ocultado para evitar a apresentação de uma estimativa
                antiga como atual. Confirme os demais dados nos links originais.
              </p>
            )}
          </div>
        )}
        <div className={styles.signalBar}>
          <div className={styles.signal}>
            <span className={styles.signalLabel}>Severidade técnica</span>
            <strong>{labels[cve.severity ?? ""] ?? "Não informada"}</strong>
            <small>CVSS {cve.cvssVersion || "sem versão"}</small>
          </div>
          <div className={styles.signal}>
            <span className={styles.signalLabel}>EPSS</span>
            <strong>
              {cve.epss === null
                ? "Indisponível"
                : (cve.epss * 100).toFixed(2) + "%"}
            </strong>
            <small>Score de {date(metadata?.epss.date)}</small>
          </div>
          <div className={styles.signal}>
            <span className={styles.signalLabel}>CISA KEV</span>
            <strong>
              {cve.inCisaKev
                ? "Reportada"
                : metadata?.kev.status === false
                  ? "Não catalogada"
                  : "Não verificado"}
            </strong>
            <small>Consulta de {date(metadata?.kev.checkedAt)}</small>
          </div>
          <div className={styles.signal}>
            <span className={styles.signalLabel}>Prioridade operacional</span>
            <strong>{priority.label}</strong>
            <small>Regras Statecraft v1</small>
          </div>
        </div>
        <nav className={styles.sectionIndex} aria-label="Nesta ficha">
          {sections.map((section, index) => (
            <a
              key={section}
              href={"#secao-" + String(index + 1).padStart(2, "0")}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section}
            </a>
          ))}
        </nav>
        <div className={styles.dossierGrid}>
          <div className={styles.readingColumn}>
            <Section n={1}>
              <p className={styles.leadText}>{technicalSummary(cve)}</p>
              <dl className={styles.factList}>
                <div>
                  <dt>Classificação</dt>
                  <dd>
                    {cve.vulnType} · {cve.cweId || "CWE não informada"}
                  </dd>
                </div>
                <div>
                  <dt>Fonte</dt>
                  <dd>
                    <a
                      href={cve.nvdUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      NVD / registro original
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Enriquecimento</dt>
                  <dd>
                    {cve.ptBrDescription
                      ? "Texto com validação automática de suporte à fonte. Não afirma revisão humana."
                      : "Análise em português indisponível; resumo composto apenas por metadados."}
                  </dd>
                </div>
              </dl>
            </Section>
            <Section n={2}>
              <dl className={styles.factList}>
                <div>
                  <dt>CVSS</dt>
                  <dd>
                    {cve.cvssScore?.toFixed(1) ?? "Não informado"} · versão{" "}
                    {cve.cvssVersion || "não informada"}
                    <br />
                    Fornecedor da métrica:{" "}
                    {metadata?.nvd.metricSource || "não informado"}
                    <br />
                    <a href={cve.nvdUrl}>Fonte: NVD</a>
                  </dd>
                </div>
                <div>
                  <dt>EPSS</dt>
                  <dd>
                    {cve.epss === null
                      ? "Indisponível"
                      : (cve.epss * 100).toFixed(2) + "%"}{" "}
                    · data {date(metadata?.epss.date)}
                    <br />
                    Percentil:{" "}
                    {cve.epssPercentile === null
                      ? "não informado"
                      : (cve.epssPercentile * 100).toFixed(1)}
                    <br />
                    <a
                      href={
                        metadata?.epss.url ??
                        "https://api.first.org/data/v1/epss?cve=" + id
                      }
                    >
                      Fonte: FIRST EPSS
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>KEV</dt>
                  <dd>
                    {cve.inCisaKev
                      ? "Presença reportada no catálogo"
                      : metadata?.kev.status === false
                        ? "Não consta na consulta disponível"
                        : "Não foi possível verificar"}
                    <br />
                    Consulta: {date(metadata?.kev.checkedAt)}
                    {metadata?.kev.dateAdded && (
                      <>
                        <br />
                        Inclusão: {date(metadata.kev.dateAdded)}
                      </>
                    )}
                    <br />
                    <a
                      href={
                        metadata?.kev.url ??
                        "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                      }
                    >
                      Fonte: CISA KEV
                    </a>
                  </dd>
                </div>
              </dl>
              <p>
                EPSS é probabilidade estimada, não evidência de exploração.
                Referências de exploit não demonstram comprometimento no seu
                ambiente.
              </p>
              {exploits.length ? (
                exploits.map((r) => (
                  <Source key={r.url} href={r.url}>
                    Referência catalogada como Exploit ·{" "}
                    {new URL(r.url).hostname}
                  </Source>
                ))
              ) : (
                <p>
                  Sem referências de exploit identificadas nesta ficha. Isso não
                  comprova ausência de exploração.
                </p>
              )}
              <div className={styles.dataNotice}>
                <strong>{priority.label}</strong>
                <p>{priority.reason}</p>
                {priority.missing.length > 0 && (
                  <p>Dados ausentes: {priority.missing.join(", ")}.</p>
                )}
                <Link href="/cves#priorizacao-cves">
                  Consultar critérios e limitações
                </Link>
              </div>
            </Section>
            <Section n={3}>
              {metadata?.products.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.productTable}>
                    <caption>
                      Aplicabilidade reportada pelo NVD. Limites de versões não
                      identificam, por si só, uma correção.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Fabricante / produto</th>
                        <th scope="col">Versões afetadas</th>
                        <th scope="col">Condição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metadata.products.map((p, index) => (
                        <tr key={p.cpe + index}>
                          <td>
                            {p.vendor.replaceAll("_", " ")}
                            <br />
                            <strong>{p.product.replaceAll("_", " ")}</strong>
                          </td>
                          <td>{versionRange(p)}</td>
                          <td>
                            {p.configuration}
                            <details>
                              <summary>CPE original</summary>
                              <code>{p.cpe}</code>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>
                  {cve.affectedProducts.length
                    ? "Produtos reportados: " +
                      cve.affectedProducts.join(", ") +
                      ". As faixas de versões não estão disponíveis nesta ficha."
                    : "Produtos e versões não informados pelas fontes consultadas."}
                </p>
              )}
              <p>
                Combinações AND, OR e NEGATE descrevem condições do NVD. A
                tabela não substitui a expressão completa nem a verificação de
                configuração e plataforma no{" "}
                <a href={cve.nvdUrl}>registro original</a>.
              </p>
            </Section>
            <Section n={4}>
              {cve.ptBrDescription ? (
                <>
                  <p className={styles.leadText}>{cve.ptBrDescription}</p>
                  <p>
                    Enriquecimento validado automaticamente em{" "}
                    {date(cve.enrichedAt)}.
                  </p>
                </>
              ) : (
                <p>
                  Análise técnica enriquecida indisponível. O texto original foi
                  preservado abaixo.
                </p>
              )}
              <details
                className={styles.sourceDetails}
                open={!cve.ptBrDescription}
              >
                <summary>
                  Descrição original do NVD{" "}
                  <ChevronRight size={15} aria-hidden />
                </summary>
                <p lang="en">{cve.description || "Descrição não informada."}</p>
              </details>
            </Section>
            <Section n={5}>
              {metadata?.nvd.vector ? (
                <>
                  <p>
                    Condições e impactos classificados pelo vetor CVSS. São
                    características da métrica, não um relato de exploração
                    observada.
                  </p>
                  <code className={styles.vector}>{metadata.nvd.vector}</code>
                  <dl className={styles.factList}>
                    {conditions.map((c) => (
                      <div key={c.key}>
                        <dt>{c.key}</dt>
                        <dd>
                          <strong>{c.label}:</strong> {c.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p>
                  Vetor CVSS indisponível. Não há dados estruturados suficientes
                  nesta ficha para detalhar condições de acesso ou impacto
                  específico.
                </p>
              )}
              <p>
                Confirme versões, requisitos e configurações na descrição
                original e nos advisories. A classe CWE não comprova, sozinha,
                impacto ou técnica de exploração desta CVE.
              </p>
            </Section>
            <Section n={6}>
              <h3 className={styles.subheading}>
                Versões corrigidas documentadas
              </h3>
              {metadata?.fixedVersions.length ? (
                <ul className={styles.evidenceList}>
                  {metadata.fixedVersions.map((v) => (
                    <li key={[v.package, v.ecosystem, v.version].join("|")}>
                      <strong>
                        {v.package} · {v.version}
                      </strong>
                      <p>
                        Ecossistema: {v.ecosystem}. Correção explicitamente
                        registrada no campo fixed do OSV ({v.rangeType}).
                        Verifique a linha de versões aplicável.
                      </p>
                      <a
                        href={v.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Consultar registro da correção ↗
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Nenhuma versão corrigida confirmada foi recuperada nesta
                  consulta. Limites de versões afetadas não foram convertidos em
                  recomendações de atualização.
                </p>
              )}
              <h3 className={styles.subheading}>Orientações oficiais</h3>
              {metadata?.kev.requiredAction && (
                <blockquote className={styles.quotedAdvice}>
                  <p lang="en">{metadata.kev.requiredAction}</p>
                  <cite>
                    <a href={metadata.kev.url}>Ação requerida pela CISA</a>
                  </cite>
                  {metadata.kev.dueDate && (
                    <p>
                      Prazo informado no catálogo: {date(metadata.kev.dueDate)}.
                      A aplicabilidade desse prazo depende do escopo da
                      diretiva.
                    </p>
                  )}
                </blockquote>
              )}
              {advisories.length ? (
                advisories.map((r) => (
                  <Source key={r.url} href={r.url}>
                    Advisory do fornecedor catalogado no NVD ·{" "}
                    {new URL(r.url).hostname}
                  </Source>
                ))
              ) : (
                <p>
                  Advisory do fornecedor não identificado nos dados disponíveis.
                </p>
              )}
              <h3 className={styles.subheading}>
                Mitigações temporárias e limitações
              </h3>
              {cve.mitigation ? (
                <p className={styles.leadText}>{cve.mitigation}</p>
              ) : (
                <p>
                  Não há mitigação temporária específica validada nesta ficha.
                  Confirme orientações e restrições nos documentos oficiais
                  vinculados.
                </p>
              )}
              {fixReferences.map((r) => (
                <Source key={r.url} href={r.url}>
                  {r.tags.join(" · ")} · referência do NVD
                </Source>
              ))}
              <p>
                Uma referência de patch não confirma automaticamente uma versão
                corrigida. Não foram inferidos comandos de contenção, versões ou
                bloqueios de indicadores.
              </p>
            </Section>
            <Section n={7}>
              <h3 className={styles.subheading}>Fontes e referências</h3>
              <Source href={cve.nvdUrl}>
                NVD · descrição, CVSS, CPE e referências
              </Source>
              <Source
                href={
                  metadata?.epss.url ??
                  "https://api.first.org/data/v1/epss?cve=" + id
                }
              >
                FIRST EPSS · score e data
              </Source>
              <Source
                href={
                  metadata?.kev.url ??
                  "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                }
              >
                CISA KEV · catálogo de exploração conhecida
              </Source>
              {metadata?.references.map((r) => (
                <Source key={r.url} href={r.url}>
                  {new URL(r.url).hostname}
                  <small>
                    {r.tags.join(" · ") || "Referência do registro NVD"}
                    {r.source ? " · " + r.source : ""}
                  </small>
                </Source>
              ))}
              <h3 className={styles.subheading}>Vínculos documentados</h3>
              {!related.length && !linkedCampaigns.length && (
                <p>
                  Nenhum briefing ou campanha com vínculo explícito e fonte
                  disponível.
                </p>
              )}
              {linkedCampaigns.map((c) => (
                <article className={styles.relation} key={c.slug}>
                  <Link href={"/campanhas/" + c.slug}>
                    <strong>{c.title}</strong>
                  </Link>
                  <p>{c.cves.find((v) => v.id === id)?.context}</p>
                  {c.sources.map((s) => (
                    <Source key={s.url} href={s.url}>
                      {s.name}
                    </Source>
                  ))}
                </article>
              ))}
              {related.map((b) => (
                <article key={b.slug} className={styles.relation}>
                  <Link href={"/threat-briefings/" + b.slug}>
                    <strong>{b.title}</strong>
                  </Link>
                  <p>
                    Briefing validado que cita explicitamente {id}. Os itens
                    abaixo são relacionados no contexto desse briefing, sem
                    atribuir automaticamente cada técnica ou IOC à exploração da
                    CVE.
                  </p>
                  {b.techniques.map((t) => (
                    <div key={t.id}>
                      <a href={t.url} target="_blank" rel="noopener noreferrer">
                        {t.id} · {t.name}
                      </a>
                      <blockquote>{t.quote}</blockquote>
                      <a href={t.sourceUrl}>
                        Fonte da associação ({t.kind}) ↗
                      </a>
                    </div>
                  ))}
                  {b.iocs.length > 0 && (
                    <details>
                      <summary>
                        IOCs no mesmo registro de fonte ({b.iocs.length})
                      </summary>
                      <ul className={styles.evidenceList}>
                        {b.iocs.map((i) => (
                          <li key={i.type + i.value}>
                            <code>{i.value}</code> · {i.type}
                            <br />
                            <a href={i.sourceUrl}>Fonte do indicador ↗</a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              ))}
            </Section>
          </div>
          <aside
            className={styles.referenceColumn}
            aria-label="Leitura da ficha"
          >
            <div className={styles.sidePanel}>
              <h2 className={styles.sideHeading}>Critério de decisão</h2>
              <p>{priority.reason}</p>
              <p>
                Prioridade editorial para triagem. Não substitui avaliação da
                exposição e criticidade do ativo.
              </p>
              <Link href="/cves#priorizacao-cves" className={styles.sourceLink}>
                Método transparente <ArrowUpRight size={15} aria-hidden />
              </Link>
            </div>
            <div className={styles.sidePanel}>
              <h2 className={styles.sideHeading}>Estado dos dados</h2>
              <dl className={styles.factList}>
                <div>
                  <dt>NVD</dt>
                  <dd>{date(cve.fetchedAt)}</dd>
                </div>
                <div>
                  <dt>EPSS</dt>
                  <dd>{date(metadata?.epss.date)}</dd>
                </div>
                <div>
                  <dt>KEV</dt>
                  <dd>{date(metadata?.kev.checkedAt)}</dd>
                </div>
                <div>
                  <dt>Correções</dt>
                  <dd>{date(metadata?.remediationCheckedAt)}</dd>
                </div>
              </dl>
              <p>
                Datas ausentes permanecem não informadas. A indisponibilidade de
                um dado não é tratada como ausência de risco.
              </p>
            </div>
          </aside>
        </div>
        <footer className={styles.bottomNote}>
          <span>STATECRAFT / CYBER INTELLIGENCE</span>
          <p>Dados com origem, contexto e limites explícitos.</p>
        </footer>
      </div>
    </main>
  );
}
