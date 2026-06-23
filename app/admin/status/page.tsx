import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Shield, CheckCircle, XCircle, Clock, ArrowLeft, LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Status Operacional | Statecraft Admin" };

async function getStatus() {
  const [
    briefingCount,
    iocCount,
    cveCount,
    newsCount,
    cronLogs,
  ] = await Promise.all([
    prisma.briefing.count({ where: { status: "published" } }),
    prisma.ioc.count(),
    prisma.cveCache.count(),
    prisma.newsCache.count(),
    prisma.cronLog.findMany({
      orderBy: { runAt: "desc" },
      take: 10,
    }),
  ]);

  return { briefingCount, iocCount, cveCount, newsCount, cronLogs };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default async function AdminStatusPage() {
  const { briefingCount, iocCount, cveCount, newsCount, cronLogs } = await getStatus();
  const lastRun = cronLogs[0];

  const stats = [
    { label: "Briefings publicados", value: briefingCount, color: "text-brand-soft" },
    { label: "IOCs coletados", value: iocCount.toLocaleString("pt-BR"), color: "text-orange-400" },
    { label: "CVEs em cache", value: cveCount, color: "text-yellow-400" },
    { label: "Notícias cacheadas", value: newsCount, color: "text-blue-400" },
  ];

  return (
    <main className="min-h-screen bg-canvas pt-16">
      {/* Header */}
      <div className="border-b border-white/[0.04] sticky top-0 bg-canvas/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={14} className="text-brand" />
            <span className="text-xs font-bold text-white">Admin</span>
            <span className="text-[#555]">/</span>
            <span className="text-xs text-body">Status</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-dim hover:text-white transition-colors"
            >
              <ArrowLeft size={11} />
              Site
            </Link>
            <form action="/api/admin/auth" method="POST">
              <button
                formMethod="DELETE"
                formAction="/api/admin/auth"
                className="flex items-center gap-1.5 text-xs text-dim hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded px-1"
              >
                <LogOut size={11} />
                Sair
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Status Operacional</h1>
        <p className="text-xs text-body mb-8">
          Dados do banco. Atualizado a cada carregamento.
        </p>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="bg-raised border border-white/[0.06] rounded-xl p-5">
              <p className="text-xs text-dim uppercase tracking-widest mb-2">{s.label}</p>
              <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Last cron run */}
        {lastRun && (
          <div className="bg-raised border border-white/[0.06] rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={13} className="text-dim" />
              <h2 className="text-sm font-bold text-white">Última execução do cron</h2>
              <span className="text-xs text-dim">{timeAgo(lastRun.runAt)}</span>
            </div>

            <div className="grid sm:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-dim mb-1">Status</p>
                <div className="flex items-center gap-1.5">
                  {lastRun.success
                    ? <CheckCircle size={13} className="text-green-400" />
                    : <XCircle size={13} className="text-brand-soft" />
                  }
                  <span className={`text-xs font-bold ${lastRun.success ? "text-green-400" : "text-brand-soft"}`}>
                    {lastRun.success ? "Sucesso" : "Falha"}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-dim mb-1">Briefings criados</p>
                <p className="text-sm font-bold text-white">{lastRun.briefingsCreated}</p>
              </div>
              <div>
                <p className="text-xs text-dim mb-1">Duração</p>
                <p className="text-sm font-mono text-white">{formatDuration(lastRun.durationMs)}</p>
              </div>
              <div>
                <p className="text-xs text-dim mb-1">Erros</p>
                <p className={`text-sm font-bold ${lastRun.errors.length ? "text-brand-soft" : "text-dim"}`}>
                  {lastRun.errors.length || "—"}
                </p>
              </div>
            </div>

            {lastRun.sources.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-dim mb-1.5">Fontes consultadas</p>
                <div className="flex flex-wrap gap-1.5">
                  {lastRun.sources.map((s) => (
                    <span key={s} className="px-2 py-0.5 text-xs text-body bg-white/[0.04] border border-white/[0.06] rounded">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lastRun.errors.length > 0 && (
              <div>
                <p className="text-xs text-dim mb-1.5">Erros</p>
                <div className="space-y-1">
                  {lastRun.errors.map((e, i) => (
                    <p key={i} className="text-xs text-brand-soft font-mono bg-brand/[0.06] px-3 py-1.5 rounded border border-brand/10">
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cron history */}
        <div className="bg-raised border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold text-white">Histórico de execuções</h2>
          </div>

          <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-5 py-2 border-b border-white/[0.04] bg-white/[0.01]">
            {["Status", "Horário", "Briefings", "Duração", "Fontes", "Erros"].map((h) => (
              <span key={h} className="text-xs font-bold text-dim uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {cronLogs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-dim text-center">Nenhuma execução registrada ainda.</p>
          ) : (
            cronLogs.map((log) => (
              <div
                key={log.id}
                className="grid sm:grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-3 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.01] transition-colors"
              >
                <div className="flex items-center">
                  {log.success
                    ? <CheckCircle size={12} className="text-green-400" />
                    : <XCircle size={12} className="text-brand-soft" />
                  }
                </div>
                <span className="text-xs text-body font-mono">{formatDate(log.runAt)}</span>
                <span className="text-xs font-bold text-white text-center">{log.briefingsCreated}</span>
                <span className="text-xs font-mono text-dim">{formatDuration(log.durationMs)}</span>
                <span className="text-xs text-dim">{log.sources.length}</span>
                <span className={`text-xs font-bold ${log.errors.length ? "text-brand-soft" : "text-dim"}`}>
                  {log.errors.length || "—"}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Link
            href="/api/health"
            target="_blank"
            className="text-xs text-dim hover:text-white transition-colors font-mono"
          >
            /api/health ↗
          </Link>
        </div>
      </div>
    </main>
  );
}
