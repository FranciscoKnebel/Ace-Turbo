# Validação da refatoração

## Referências determinísticas

Três seeds (1, 17, 99), 2400 ticks a 120 Hz: as extrações de controlador,
sistemas e IA preservam estados exatos. A correção da previsão altera decisões
da IA e tem uma nova referência explícita; a anterior foi preservada em
`tests/fixtures/pre-shared-physics.json`. Nenhum parâmetro de classe foi
recalibrado nesta pilha.

## Efeito da previsão compartilhada

Matriz normal, duplas CPU, um set, seed 1, lados espelhados, oito classes:
128 partidas por versão. Vitórias da classe da linha, incluindo sua diagonal.
O primeiro levantamento usou o CLI anterior; seus dados não tinham flags de
timeout. Estes números servem para observar a mudança, não para concluir
balanceamento com uma amostra tão pequena. Tempo observado: 43,1 s antes,
74,5 s após corrigir a previsão, antes de reutilizar previsões entre parceiros.
Os tempos não são um benchmark isolado.

| Classe | Antes | Física corrigida |
|---|---:|---:|
| balanced | 5/16 | 10/16 |
| power | 7/16 | 6/16 |
| wall | 10/16 | 8/16 |
| server | 9/16 | 6/16 |
| technician | 14/16 | 12/16 |
| speedster | 4/16 | 4/16 |
| veteran | 14/16 | 15/16 |
| bruiser | 1/16 | 3/16 |

O runner novo distingue partidas completas e censuradas, mantém cada seed/lado,
registra revisão/Node/opções e mede break points antes de cada ponto. A taxa de
vitórias exclui timeouts. BP convertidos são do recebedor; BP salvos são do
sacador; deuce no-ad é tratado como oportunidade e tiebreak não é break point.

## Apresentação

Geometria de texto instrumentada para PT/EN em 1280×720, 640×360 e 390×844,
incluindo todas as páginas da ajuda e resultado com cinco sets. Os testes
usam métricas aproximadas de Canvas; inspeção visual em navegador é uma
verificação complementar, ainda não realizada neste ambiente.

## Runner novo

Matriz normal completa com seed 1 e lados espelhados: 128 partidas concluídas,
zero timeouts. Agregados, opções e proveniência em `balance-refactor.json`.
O SHA local corresponde à mesma árvore do PR de apresentação; o runner estava
na árvore de trabalho durante a medição, como registrado no arquivo.
