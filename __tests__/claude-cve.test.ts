import { expect, it } from 'vitest';
import { safeCveEnrichment } from '../lib/intelligence/cve-policy';
import { editorialDraft } from '../lib/intelligence/editorial-validation';
import { PERSONAS } from '../lib/ai/editorial-personas';
it('exibe tradução de CVE somente com fechamento válido para os campos atuais', () => {
  const description = 'Microsoft fixed a flaw in the server. Apply the update.';
  const fields = { ptBrDescription: 'Microsoft corrigiu uma falha no servidor.', mitigation: 'Aplique a correção.' };
  const report = { ...editorialDraft(description, fields, PERSONAS["rafael-nogueira"]), state: 'published', publishable: true, editorDecision: 'publicar', claims: [{ texto: fields.ptBrDescription, trechoDaFonte: description, situacao: 'apoiada' }] };
  const cve = { id: 'CVE-2026-12345', description, ...fields, cvssScore: 7.5, epss: null, inCisaKev: false, qualityReport: report };
  expect(safeCveEnrichment(cve)).toMatchObject({ ptBrDescription: fields.ptBrDescription, contentOrigin: 'automated', desk: PERSONAS["rafael-nogueira"].desk });
  expect(safeCveEnrichment({ ...cve, description: description + ' Changed.' }).ptBrDescription).toBeNull();
  expect(safeCveEnrichment({ ...cve, mitigation: 'Ação alterada.' }).ptBrDescription).toBeNull();
});
