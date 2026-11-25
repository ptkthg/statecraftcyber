import { describe, expect, it } from 'vitest';
import { checkEditorialFields, realQuote } from '../lib/intelligence/editorial-validation';

// Trecho real de comunicado da CISA (fonte pública), no formato achatado que chega do RSS.
const source = [
  'Publicado em 2026-11-24',
  'CISA Adds Three Known Exploited Vulnerabilities to Catalog',
  'CISA has added three new vulnerabilities to its Known Exploited Vulnerabilities (KEV) Catalog, based on evidence of active exploitation. CVE-2026-132165 Drupal Core Remote Code Execution Vulnerability These types of vulnerabilities are a frequent attack vector for malicious cyber actors and pose significant risks to the federal enterprise. Binding Operational Directive (BOD) 26-04: Prioritizing Security Updates Based on Risk establishes vulnerability management requirements for Federal Civilian Executive Branch (FCEB) agencies.',
].join('\n');

describe('citação literal', () => {
  it('aceita trecho parcial de lista achatada', () => {
    expect(realQuote(source, 'CVE-2026-132165 Drupal Core Remote Code Execution Vulnerability')).toBe(true);
    expect(realQuote(source, 'Publicado em 2026-11-24')).toBe(true);
  });
  it('recusa trecho que corta palavra, que não existe ou que é curto demais', () => {
    expect(realQuote(source, 'upal Core Remote Code Execution')).toBe(false);
    expect(realQuote(source, 'Drupal Core Remote Code Execution Vulnerability in version 10')).toBe(false);
    expect(realQuote(source, 'Drupal Core')).toBe(false);
  });
});

describe('nomes próprios', () => {
  const ok = (text: string) => checkEditorialFields(source, { corpo: text }).filter(i => i.code === 'entity.name');
  it('aceita nome traduzido acompanhado da sigla que está na fonte', () => {
    expect(ok('A CISA cita a Diretriz Operacional Vinculante (BOD) 26-04 e o catálogo de Vulnerabilidades Conhecidas e Exploradas (KEV).')).toEqual([]);
  });
  it('recusa o mesmo nome com sigla que não está na fonte', () => {
    expect(ok('A agência cita a Diretriz Operacional Vinculante (XYZ).')).not.toEqual([]);
  });
  it('aceita termos institucionais traduzidos e o Brasil em registro do que a fonte não informa', () => {
    expect(ok('A norma vale para o Poder Executivo federal dos EUA. A fonte não informa impacto no Brasil.')).toEqual([]);
  });
  it('trata começo de linha, item de lista e negrito como início de frase', () => {
    expect(ok('### Situação atual\n\nFalhas entram na lista.\n- Quem souber de outra falha pode avisar.\n**Mesmo** assim, a CISA orienta todos.')).toEqual([]);
  });
  it('continua recusando empresa ou grupo ausente da fonte', () => {
    expect(ok('A falha foi explorada pelo grupo Lazarus contra a Microsoft.')).not.toEqual([]);
  });
});

describe('datas e números', () => {
  it('aceita a data de publicação que abre a fonte', () => {
    expect(checkEditorialFields(source, { lide: 'A CISA publicou o aviso em 24 de novembro de 2026.' }).filter(i => i.code === 'entity.number')).toEqual([]);
  });
  it('continua recusando número ausente da fonte', () => {
    expect(checkEditorialFields(source, { lide: 'A CISA incluiu 12 falhas.' }).filter(i => i.code === 'entity.number')).not.toEqual([]);
  });
});
