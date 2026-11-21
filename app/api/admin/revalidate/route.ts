import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  for (const path of ['/', '/noticias', '/threat-briefings', '/iocs', '/api/briefings', '/api/noticias', '/api/iocs']) revalidatePath(path);
  revalidatePath('/threat-briefings/[slug]', 'page');
  return NextResponse.json({ revalidated: true });
}
