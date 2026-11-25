import { afterEach, expect, it, vi } from 'vitest';
import { checkEditorialFields } from '../lib/intelligence/editorial-validation';
afterEach(() => vi.unstubAllEnvs());
it('não permite países com inicial acentuada fora da fonte', () => {
  expect(checkEditorialFields('Only documented countries.', { texto: 'A campanha atingiu a Áustria e a Índia.' })).toHaveLength(2);
});
it('reprova unidade ou versão que reutiliza um número fora do contexto da fonte', () => {
  expect(checkEditorialFields('The incident affected 5 devices and 1500 users.', { texto: 'A falha afetou 5 milhões de dispositivos.' })).not.toHaveLength(0);
  expect(checkEditorialFields('The incident affected 1500 users.', { texto: 'A versão 1.500 é afetada.' })).not.toHaveLength(0);
});
it('preserva URLs citadas com pontuação final e distingue maiúsculas no caminho', () => {
  const source = 'Read https://example.org/Advisory. The vendor published details.';
  expect(checkEditorialFields(source, { texto: 'Consulte https://example.org/Advisory.' })).toEqual([]);
  expect(checkEditorialFields(source, { texto: 'Consulte https://example.org/advisory.' })).not.toHaveLength(0);
});
