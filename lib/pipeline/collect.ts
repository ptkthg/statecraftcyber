import { fetchAllSources, fetchEpssScores } from '../threat-sources';
import { withSource } from './context';
export async function collectThreats() {
  const result = await fetchAllSources();
  const cves = [...new Set(result.items.flatMap(i => i.cves ?? []))];
  const scores = Object.fromEntries(await withSource('FIRST EPSS', async () => Object.entries(await fetchEpssScores(cves))));
  for (const item of result.items) if (item.cves?.length === 1 && item.epssScore === undefined) {
    const cve = item.cves[0], score = scores[cve];
    if (score !== undefined) {
      item.epssScore = score;
      item.evidenceSources = [...(item.evidenceSources ?? []).filter(s => s.id !== 'epss'), { id: 'epss', name: 'FIRST EPSS', url: 'https://api.first.org/data/v1/epss?cve=' + cve, text: JSON.stringify({ cve, epss: score }), retrievedAt: new Date().toISOString(), origin: 'original' }];
    }
  }
  return result;
}
