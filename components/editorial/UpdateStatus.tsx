import { prisma } from '@/lib/prisma';
import { updateHealth } from '@/lib/pipeline/health';
export default async function UpdateStatus() {
  const [records, runs] = await Promise.all([prisma.updateHealth.findMany(), prisma.pipelineRun.findMany({ where: { engine: 'langgraph' }, orderBy: { startedAt: 'desc' }, take: 5 })]);
  const format = (value: Date | null) => value ? value.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Ainda não registrada';
  return <section className="mb-8 rounded-xl border p-5"><h2 className="text-lg font-bold">Atualização automática</h2><p>Horários de Brasília.</p>
    {['briefings', 'news'].map(key => { const health = updateHealth(records.find(r => r.key === key) ?? null); return <div key={key} className="mt-4"><h3 className="font-bold">{key === 'news' ? 'Notícias' : 'Briefings'}: {health.status}</h3><dl><dt>Última tentativa</dt><dd>{format(health.lastAttemptAt)}</dd><dt>Última coleta bem-sucedida</dt><dd>{format(health.lastCollectionAt)}</dd><dt>Última publicação</dt><dd>{format(health.lastPublicationAt)}</dd></dl>{key === 'briefings' && health.publicationWarning && <p>Sem publicação recente. Verifique novidades, rejeições e credenciais.</p>}</div>; })}
    <h3 className="mt-4 font-bold">Execuções do worker</h3><ul>{runs.map(run => <li key={run.id}>{format(run.startedAt)} · {run.status} · etapa {run.stage} · {JSON.stringify(run.errors)}</li>)}</ul>
  </section>;
}
