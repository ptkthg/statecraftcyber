import type { StructuredBriefing } from '../types';
import type { EvidenceSource } from './types';
export const briefingEditorialSource = (sources: EvidenceSource[]) => sources.filter(s => s.origin === 'original').map(s => s.text).join('\n');
export function briefingNarrativeFields(briefing: StructuredBriefing): Record<string, string> {
  const fields: Record<string, string> = { title: briefing.title, executiveSummary: briefing.executiveSummary, whatHappened: briefing.whatHappened, whyItMatters: briefing.whyItMatters, whoIsAtRisk: briefing.whoIsAtRisk, technicalDetails: briefing.technicalDetails, falsePositiveNotes: briefing.falsePositiveNotes };
  briefing.recommendedActions.forEach((v, i) => fields['recommendedActions.' + i] = v);
  briefing.detectionSuggestions.forEach((v, i) => fields['detectionSuggestions.' + i] = v);
  return fields;
}
