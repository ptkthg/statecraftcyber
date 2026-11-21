const origin = process.env.SITE_ORIGIN ?? 'https://statecraftcyber.vercel.app';
try {
  const response = await fetch(new URL('/api/health', origin), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const health = await response.json();
  const pipelines = health.pipelines;
  if (!response.ok || health.database !== 'ok' || !pipelines || Object.values(pipelines).some(p => p.status !== 'ok')) {
    console.error('Atualização degradada: verificar /admin/status e o workflow de geração.'); process.exitCode = 1;
  } else console.log('Coletas recentes e pipelines saudáveis.');
} catch { console.error('Não foi possível verificar a atualização.'); process.exitCode = 1; }
