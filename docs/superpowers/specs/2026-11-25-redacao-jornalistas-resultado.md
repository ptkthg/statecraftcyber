# Resultado: cinco jornalistas, sorteio e ajustes da política editorial

Data: 25/11/2026. Spec: [2026-11-25-redacao-jornalistas.md](2026-11-25-redacao-jornalistas.md).

## Quem fez o quê

O Codex implementou a maior parte (sorteio ponderado e fixo, gravação da persona, identidade pública em
`lib/journalists.ts`, `JournalistByline`, filtro `?jornalista=`, página `/redacao` e testes) e parou ao atingir o
limite de uso da conta. O Claude concluiu:

- ficha de CVE assinada por Rafael Nogueira (`lib/intelligence/cve-policy.ts`);
- `/redacao` no rodapé, no sitemap e na verificação de publicação; metodologia com os cinco jornalistas e os modelos
  (Sonnet 5.5 escreve, Haiku 5.5 confere);
- assinatura compacta nos cards de notícia da home;
- correção de um teste do filtro que olhava a aba errada (a notícia do teste era de "Contexto", não de "Alertas").

## Ajustes da política `editorial-v1` depois do primeiro teste real

Uma coleta real com 6 notícias teve 6 matérias seguradas pela checagem determinística, sem chegar ao editor. A
leitura dos textos mostrou matérias fiéis à fonte, reprovadas por regras mecânicas. Ajustes, todos cobertos por testes
em `__tests__/editorial-relaxations.test.ts` e `__tests__/editorial-validation.test.ts`:

1. **Citações:** o trecho de apoio deixa de precisar ser uma frase inteira. Aceita trecho literal (espaços
   normalizados) com 12 caracteres ou mais, sem cortar palavra. As fontes chegam como listas e tabelas achatadas.
2. **Fonte:** `newsEvidence` abre com "Fonte: {veículo}" e "Publicado em {data}", para a atribuição e a data citadas
   na matéria terem apoio.
3. **Início de frase:** começo de linha, item de lista, negrito e o que vem depois de dois-pontos contam como início de
   frase na checagem de nomes próprios.
4. **Nomes traduzidos:** "Diretriz Operacional Vinculante (BOD)" é aceito quando a sigla entre parênteses está na
   fonte. Termos institucionais (EUA, Poder Executivo, governo federal) também são aceitos.
5. **Brasil:** permitido em qualquer campo, para registrar que a fonte não trata do país. Dizer que o Brasil foi
   afetado continua exigindo trecho da fonte, conferido pelo editor.
6. **Cobertura:** deixa de exigir que todo o texto seja coberto por afirmações. Frases que só registram o que a fonte
   não informa não são afirmações. Cada afirmação listada pelo editor continua precisando estar na matéria e ter trecho
   literal na fonte.

Continuam barrados: CVE, número, versão, URL, domínio, IP, hash, empresa, produto ou grupo ausente da fonte; estilo
proibido; avaliação sem rótulo ou com fato novo.

## Verificação

- Ensaio sem gravação (Dark Reading, 13 pacotes NuGet): matéria da Marina Tavares aprovada pelo editor, com 11
  afirmações conferidas. Custo: ~US$ 0,011 da escrita (sem lote) e ~US$ 0,0016 da conferência.
- `npx tsc --noEmit`, `npm run lint` (3 avisos preexistentes), 75 arquivos e 490 testes, `npm run build` e build em
  modo snapshot: aprovados.
