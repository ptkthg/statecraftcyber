import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const GET = retired;
export const POST = retired;
async function retired(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json({ error: 'scheduler_retired', message: 'A atualização agora é executada pelo workflow de GitHub Actions.' }, { status: 410 });
}
