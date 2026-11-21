import { expect, it } from 'vitest';
import { evidenceExcerpts, expandExcerptSelection } from '../lib/briefing/evidence-excerpts';
import { sourceEvidence } from '../lib/intelligence/evidence';
import { validateBriefing } from '../lib/intelligence/validation';
import { parseStructuredBriefing } from '../lib/briefing/parse-structured-briefing';
import { groundedFixture, NOW } from './fixtures/intelligence';
const source = { id: 'source', name: 'Vendor', url: 'https://example.org', text: 'Original source title\n\nThe affected product can lose availability.\n\nUpgrade to the documented patched version.', retrievedAt: new Date().toISOString(), origin: 'original' as const };
const empty = {executiveSummary:'',whatHappened:'',whyItMatters:'',whoIsAtRisk:'',technicalDetails:'',falsePositiveNotes:'',recommendedActions:[],detectionSuggestions:[]};
it('expands selected IDs into unchanged source text and exactly one indexed claim', () => {
  const excerpts = evidenceExcerpts([source]);
  const action = excerpts.find(e=>e.text.startsWith('Upgrade'))!;
  const result = expandExcerptSelection(JSON.stringify({ ...empty, executiveSummary: action.id, recommendedActions: [action.id] }), excerpts);
  expect(result?.executiveSummary).toBe(action.text);
  expect(result?.claims).toEqual([{field:'executiveSummary',kind:'reported',sourceId:'source',quote:action.text},{field:'recommendedActions.0',kind:'reported',sourceId:'source',quote:action.text}]);
});
it('rejects fabricated IDs and ignores generated sources', () => {
  expect(expandExcerptSelection(JSON.stringify({...empty,whatHappened:'invented'}), evidenceExcerpts([source]))).toBeNull();
  expect(expandExcerptSelection('{}', evidenceExcerpts([source]))).toBeNull();
  expect(expandExcerptSelection(JSON.stringify({...empty,recommendedActions:['invented']}), evidenceExcerpts([source]))).toBeNull();
  expect(evidenceExcerpts([{...source, origin:'generated'}])).toEqual([]);
});
it('keeps a fully grounded single-paragraph source publishable without rewriting its sentences', () => {
  const {item, briefing} = groundedFixture();
  item.description = item.description.replaceAll('\n', ' ');
  const excerpts = evidenceExcerpts(sourceEvidence(item, NOW));
  const selection: Record<string, unknown> = {...empty};
  for (const field of ['executiveSummary','whatHappened','whyItMatters','whoIsAtRisk','technicalDetails','falsePositiveNotes'] as const) {
    selection[field] = excerpts.find(e=>e.text === briefing[field])?.id;
  }
  selection.recommendedActions = briefing.recommendedActions.map(text=>excerpts.find(e=>e.text===text)?.id);
  selection.detectionSuggestions = briefing.detectionSuggestions.map(text=>excerpts.find(e=>e.text===text)?.id);
  const expanded = expandExcerptSelection(JSON.stringify(selection), excerpts);
  expect(expanded).not.toBeNull();
  const parsed = parseStructuredBriefing(JSON.stringify({...briefing,...expanded,claims:[briefing.claims![0],...(expanded!.claims as object[])]}));
  expect(validateBriefing(item, parsed, NOW).publishable).toBe(true);
});
