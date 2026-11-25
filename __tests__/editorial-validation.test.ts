import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ claudeJson: vi.fn() }));
vi.mock('../lib/ai/claude-client', async original => ({ ...await original<typeof import('../lib/ai/claude-client')>(), claudeJson: mocks.claudeJson }));
import { checkEditorialText, reviewEditorial, canRetryEditorial, type EditorialArticle } from '../lib/intelligence/editorial-validation';
import { PERSONAS, drawJournalist } from '../lib/ai/editorial-personas';
const source = 'Microsoft fixed CVE-2026-12345 in Server 2.4.1. The flaw affects 1.5 percent of servers. Apply the update to protect systems.';
const article: EditorialArticle = { chamada: 'Microsoft corrige falha', linhaFina: 'A correção está disponível.', lide: 'Segundo Microsoft, a falha afeta servidores.', corpo: 'A versão 2.4.1 corrige CVE-2026-12345.', porQueImporta: 'Avaliação Statecraft: priorizar a correção reduz a exposição.', fatosUsados: [{ texto: 'A correção está disponível.', trechoDaFonte: 'Microsoft fixed CVE-2026-12345 in Server 2.4.1.' }] };
it('aprova fatos fiéis e normaliza vírgula decimal', () => {
  expect(checkEditorialText(source, article)).toEqual([]);
  expect(checkEditorialText(source, { ...article, corpo: 'A falha afeta 1,5 por cento dos servidores.' })).toEqual([]);
});
it.each(['99 servidores', 'CVE-2026-99999', 'versão 2.4.2', 'a empresa Apple', 'o país Japão', 'o endereço evil.example', 'o IP 10.20.30.40'])('rejeita entidade nova: %s', corpo => {
  expect(checkEditorialText(source, { ...article, corpo })).not.toHaveLength(0);
});
it.each(['Avaliação Statecraft: a Apple foi afetada.', 'Priorize a correção.', 'Avaliação Statecraft: algo — novo.', 'Avaliação Statecraft: Vale destacar a correção.'])('rejeita avaliação inválida: %s', porQueImporta => {
  expect(checkEditorialText(source, { ...article, porQueImporta })).not.toHaveLength(0);
});
it('não chama editor se o determinismo reprovar', async () => {
  mocks.claudeJson.mockClear();
  const report = await reviewEditorial(source, { ...article, corpo: 'São 999 servidores.' }, PERSONAS["rafael-nogueira"]);
  expect(report.publishable).toBe(false); expect(mocks.claudeJson).not.toHaveBeenCalled();
});
it('rejeita trecho falso, afirmação sem apoio e editor sem cobertura', async () => {
  for (const afirmacoes of [[], [{ texto: 'Fato', trechoDaFonte: 'Trecho inventado.', situacao: 'apoiada' }], [{ texto: article.chamada, trechoDaFonte: source, situacao: 'sem_apoio' }]]) {
    mocks.claudeJson.mockResolvedValue({ status: 'ok', data: { afirmacoes, problemas: [], decisao: 'publicar' }, model: 'editor', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
    expect((await reviewEditorial(source, article, PERSONAS["rafael-nogueira"])).publishable).toBe(false);
  }
});
it('confere também as citações do repórter', async () => {
  expect((await reviewEditorial(source, { ...article, fatosUsados: [{ texto: 'Fato', trechoDaFonte: 'Trecho inventado' }] }, PERSONAS["rafael-nogueira"])).publishable).toBe(false);
});
// Desde 25/11/2026 o Brasil é permitido em qualquer campo ("a fonte não informa impacto no Brasil");
// dizer que o país foi afetado continua dependendo de trecho da fonte, conferido pelo editor.
it.each(['Brasil', 'brasileiro', 'brasileira', 'brasileiros', 'brasileiras'])('permite %s em qualquer campo', word => {
  expect(checkEditorialText(source, { ...article, porQueImporta: `Avaliação Statecraft: priorize a defesa no ${word}.` })).toEqual([]);
  expect(checkEditorialText(source, { ...article, corpo: `A fonte não informa impacto no ${word}.` })).not.toContainEqual({ code: 'entity.name', field: 'corpo' });
});
it('aprova afirmações conferidas, aceita registro do que a fonte não informa e reprova trecho ou texto falso', async () => {
  const corpo = '### Impacto operacional\n' + article.corpo;
  const factual = [article.chamada, article.linhaFina, article.lide, article.corpo];
  mocks.claudeJson.mockResolvedValue({ status: 'ok', data: { afirmacoes: factual.map(texto => ({ texto, trechoDaFonte: source, situacao: 'apoiada' })), problemas: [], decisao: 'publicar' }, model: 'editor', usage: {} });
  expect((await reviewEditorial(source, { ...article, corpo }, PERSONAS['rafael-nogueira'])).publishable).toBe(true);
  expect(mocks.claudeJson.mock.lastCall?.[0].prompt).toContain('porQueImporta');
  // Frase que só registra o que a fonte não informa não precisa de trecho de apoio.
  expect((await reviewEditorial(source, { ...article, corpo: corpo + '\nA fonte não informa quem explora a falha.' }, PERSONAS['rafael-nogueira'])).publishable).toBe(true);
  // Afirmação com trecho que não existe na fonte reprova a matéria inteira.
  mocks.claudeJson.mockResolvedValue({ status: 'ok', data: { afirmacoes: [{ texto: article.lide, trechoDaFonte: 'Trecho que não existe na fonte original.', situacao: 'apoiada' }], problemas: [], decisao: 'publicar' }, model: 'editor', usage: {} });
  expect((await reviewEditorial(source, { ...article, corpo }, PERSONAS['rafael-nogueira'])).publishable).toBe(false);
  // Afirmação que não está na matéria também reprova.
  mocks.claudeJson.mockResolvedValue({ status: 'ok', data: { afirmacoes: [{ texto: 'Frase que não está na matéria.', trechoDaFonte: source, situacao: 'apoiada' }], problemas: [], decisao: 'publicar' }, model: 'editor', usage: {} });
  expect((await reviewEditorial(source, { ...article, corpo }, PERSONAS['rafael-nogueira'])).publishable).toBe(false);
});
it('intertítulos dispensam nomes, mas mantêm estilo, números, identificadores e limite de quatro', () => {
  expect(checkEditorialText(source, { ...article, corpo: '### Impacto Operacional\n' + article.corpo })).toEqual([]);
  for (const heading of ['### CVE-2026-99999', '### Impacto 999', '### Veja o impacto']) {
    expect(checkEditorialText(source, { ...article, corpo: heading + '\n' + article.corpo })).not.toHaveLength(0);
  }
  expect(checkEditorialText(source, { ...article, corpo: Array(4).fill('### Impacto Operacional\n').join('') + article.corpo })).toEqual([]);
  expect(checkEditorialText(source, { ...article, corpo: Array(5).fill('### Impacto Operacional\n').join('') + article.corpo })).toContainEqual({ code: 'content.headings', field: 'corpo' });
});
it('hold permite duas novas tentativas e kill aguarda sete dias', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  expect(canRetryEditorial({ state: 'hold', attempts: 1 }, now)).toBe(true);
  expect(canRetryEditorial({ state: 'hold', attempts: 2 }, now)).toBe(true);
  expect(canRetryEditorial({ state: 'hold', attempts: 3 }, now)).toBe(false);
  expect(canRetryEditorial({ state: 'kill', checkedAt: '2026-11-24T12:00:00Z' }, now)).toBe(false);
  expect(canRetryEditorial({ state: 'kill', checkedAt: '2026-11-18T12:00:00Z' }, now)).toBe(true);
});
it.each(['Vulnerabilidade', 'Alerta Oficial', 'APT', 'Supply Chain', 'Ransomware', 'Phishing', 'Malware', 'Vazamento', 'Ataque', 'Ameaça'] as const)('pauta %s', type => {
  expect(drawJournalist('noticia-fixa', type).id).toBe(drawJournalist('noticia-fixa', type).id);
});
it('aprova o fechamento fiel quando todos os campos estão cobertos por trechos reais', async () => {
  const fields = { chamada: article.chamada, linhaFina: article.linhaFina, lide: article.lide, corpo: article.corpo, porQueImporta: article.porQueImporta };
  mocks.claudeJson.mockResolvedValue({ status: 'ok', data: { afirmacoes: Object.values(fields).map(texto => ({ texto, trechoDaFonte: 'Microsoft fixed CVE-2026-12345 in Server 2.4.1.', situacao: 'apoiada' })), problemas: [], decisao: 'publicar' }, model: 'claude-sonnet-5-5', usage: { input_tokens: 20, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
  const report = await reviewEditorial(source, article, PERSONAS["rafael-nogueira"]);
  expect(report).toMatchObject({ policyVersion: 'editorial-v1', publishable: true, state: 'published', editorDecision: 'publicar' });
  expect(report.sourceDigest).toBeTruthy(); expect(report.contentDigest).toBeTruthy();
});
