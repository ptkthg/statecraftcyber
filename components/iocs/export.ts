import type { EnrichedIoc } from '@/lib/types';

export function toCsv(iocs: EnrichedIoc[]): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = iocs.map(ioc => [ioc.type, ioc.value, ioc.confidence, ioc.briefingSeverity, ioc.briefingSlug, ioc.sourceName].map(escape).join(','));
  return 'tipo,valor,confiança,severidade,briefing_slug,fonte\r\n' + rows.join('\r\n');
}
