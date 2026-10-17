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

Matriz normal completa com seed 1 e lados espelhados, regenerada após as
correções da revisão: 128 partidas concluídas, zero timeouts. Opções, registros
por seed/lado e árvore Git imutável estão em `balance-refactor.json`.
A medição usa código integralmente commitado. A identidade pública é
`runtime.tree`: encontre seu commit com `git log --all --format='%H %T'`.
O SHA do commit local foi omitido para não atribuir a execução a um hash que
não existe no remoto; a árvore registrada pertence ao commit fonte publicado
antes do commit que adiciona este relatório. Os resultados históricos acima
não representam este rerun e não devem ser usados como evidência atual de
balanceamento.

## Varredura final

238 testes e 106 verificações de documentação. Além da matriz de 128 partidas,
17 cenários concluíram sem timeout e sem violar invariantes numéricos: três
pisos com dois climas, melhor de três/cinco com vantagem/no-ad e supertiebreak,
três modos humanos com controle CPU e quatro dificuldades adicionais.
Opções e resultados estão em `sweep-refactor.json`; CPU nos slots humanos
verifica a simulação, não substitui um teste manual dos controles.

O cliente foi verificado com montagens/desmontagens, falhas de mídia e áudio,
navegação HTML, foco da quadra e transcrições traduzidas. As duas imagens de
clima foram reduzidas de 1.618.282 para 34.661 bytes (97,9%), preservando
sua apresentação no tamanho de uso. Inspeção visual em navegador permanece
pendente.

## Complemento após o PR 65

A revisão dos critérios encontrou lacunas além da presença dos módulos.
O primeiro complemento extrai saque/regras/contato do orquestrador, encapsula
rotação de serviço, transições e redução de telemetria, preservando os replays
exatos. Novas verificações cobrem estados incompatíveis, fault/let, devolução,
fim de set/jogo, ponto único, soma entre sets, formatos inválidos e término
explícito da previsão com quique/rolagem.

## IA e experimento, complemento 15

`diagnostic-refactor.json` foi regenerado na revisão para `reachable-volley-v4`,
que inclui a passada pelo espaço central quando os dois adversários ocupam
asas opostas da rede. Guarda 128 perspectivas da matriz Normal, 64 simulações
únicas, e uma amostra focada de balanced com três seeds, 48 perspectivas e 45
simulações únicas. Todas concluíram sem timeout. `changesFromRunner` compara
esta execução com o rerun commitado do PR 64; a tabela histórica v2 foi removida.

Distribuições e intervalos agrupados por seed estão na amostra focada. Na
diagonal, duas perspectivas reutilizam a mesma partida: o relatório não
atribui um intervalo de confiança independente a essa estimativa simétrica.
A amostra continua pequena e valida o protocolo, sem concluir balanceamento.
Nenhum parâmetro de classe foi recalibrado. A identidade reproduzível de cada
execução é `runtime.tree`; o commit fonte correspondente está na história
pública antes do commit que adiciona o relatório.

```sh
npm run balance:matrix -- --class balanced --seeds 3 --difficulties normal --json confidence.json
```

