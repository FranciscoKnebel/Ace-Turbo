# Ace Turbo: Implementação

Documento técnico: como o jogo é construído por dentro. Para as regras, veja
[REGRAS.md](./REGRAS.md); para jogar, o [README](../README.md).

---

## 1. Visão geral

- **Navegador + Canvas 2D + JavaScript (ES modules)**, zero dependências de
  runtime e sem build.
- **Simulação determinística** a 120 Hz com RNG semeado (`mulberry32`),
  totalmente separada do render. É isso que permite rodar partidas CPU vs CPU
  headless nos testes.
- O cliente web só faz três coisas: lê o teclado, chama `stepWorld` e desenha o
  estado com uma câmera em perspectiva.

## 2. Estrutura de arquivos

```
├── index.html              # canvas + CSS
├── scripts/serve.js        # servidor estático mínimo (node, sem deps)
├── docs/
│   ├── REGRAS.md           # regras do jogo
│   └── IMPLEMENTACAO.md    # este documento
├── src/
│   ├── main.js             # boot, loop fixo, menu, pausa, efeitos, áudio
│   ├── input.js            # teclado → comandos por jogador
│   ├── render.js           # câmera 3D, quadra, jogadores, bola, HUD
│   ├── audio.js            # efeitos com WebAudio (sem assets)
│   └── sim/                # simulação pura (roda no Node)
│       ├── constants.js    # dimensões oficiais e constantes de gameplay
│       ├── math.js         # utilidades + balística com arrasto
│       ├── rng.js          # PRNG determinístico
│       ├── physics.js      # integração da bola, rede, quiques, cerca
│       ├── score.js        # placar oficial (pontos, games, sets, tiebreak)
│       ├── ai.js           # previsão de trajetória e controle das CPUs
│       └── world.js        # orquestra física + regras + fases da partida
└── tests/                  # node:test (ver §11)
```

## 3. Coordenadas e física

Sistema de coordenadas (metros):

- `x`: largura da quadra (−5,485 … +5,485 nas duplas; ±4,115 nas simples)
- `y`: comprimento (−11,885 … +11,885; a **rede fica em y = 0**)
- `z`: altura (0 = chão)

Constantes principais (`src/sim/constants.js`):

| Constante | Valor | Observação |
| --- | --- | --- |
| Gravidade | 10,5 m/s² | mais leve que o real para dar tempo de reação |
| Arrasto do ar | 0,08 /s | linear (`v *= e^(−k·dt)`) |
| Restituição do quique | 0,7 × `bounceScale` | top spin 1,3; slice 0,5; quiques altos |
| Atrito do chão | 0,78 | aplicado a `vx`/`vy` no quique |
| Rede | 0,914 m (centro) a 1,07 m (postes) | altura interpolada por `x` |
| Cerca | `|y| > 13,4` ou `|x| > 8,0` | encerra a jogada |
| Passo máximo | 1/240 s | substeps dentro do frame de 1/120 s |

`physics.js` integra a bola (`stepBall`) e emite eventos: `bounce`, `net`,
`cross` e `fence`. Destaques:

- **Rede**: a travessia do plano `y = 0` é interpolada; se a bola estiver abaixo
  da altura da rede no ponto de cruzamento, ela bate. Se estiver **raspando a
  fita** (menos de 12 cm abaixo do topo), ela passa fraca para o outro lado -
  é isso que produz **let** e net cords de rally; senão, volta para o lado de
  quem bateu.
- **Efeito lateral (slice)**: quando `ball.curve` é diferente de zero, o passo
da física aplica uma aceleração perpendicular ao movimento (Magnus simplificado),
curvando a bola para fora. O slice usa 3,2 m/s² nos golpes e 4,5 m/s² no saque, e
o alvo é pré-compensado (`0,5 · curve · T²`) para a bola cair no lugar certo; a
previsão da IA (`predictTrajectory`) também considera a curva.
- **Quique**: ao tocar o chão, `vz = −vz · 0,7 · bounceScale` e `vx/vy` são
  multiplicados pelo atrito. `bounceScale` é definido pelo golpe (top spin alto,
  slice baixo).
- **Previsão**: `predictTrajectory` reusa a mesma física para devolver amostras
  e os próximos quiques: é a base da IA.

### Balística

`math.js` resolve a velocidade inicial para a bola sair de um ponto e chegar ao
alvo em um tempo `T`, **já considerando o arrasto**:

```
vx = Δx / decay,  vy = Δy / decay,  vz = (Δz + g·T/k)/decay − g/k
decay = (1 − e^(−k·T)) / k
```

`timeForNetClearance` calcula o tempo mínimo de voo para a bola passar a rede
com uma folga (`clearance`). Cada golpe usa uma folga diferente (flat 0,10 m;
slice 0,06; lob 0,50; saque: flat 0,12; kick 0,45; slice 0,06; lob 1,60).

O saque usa um voo base de `lerp(14, 24, charge)` dividido pelo fator do tipo
(flat 1, kick 0,92, slice 0,78, lob 0,6): o flat sai forte (até ~25 m/s com carga
alta) e o slice/lob saem visivelmente mais lentos. `timeForNetHit` resolve o
inverso: o tempo de voo para a bola cruzar a rede exatamente em uma altura alvo
(usado pelo "saque errado" para mirar a fita, gerando fault ou let).

## 4. Loop e fases da partida

`main.js` roda `requestAnimationFrame` com acumulador e passo fixo de **1/120 s**
(até 20 passos por frame). Cada passo chama `stepWorld(world, dt)`, que executa:

1. **Inputs**: humanos leem `world.inputs[id]`; CPUs rodam `stepAI`.
2. **Jogadores**: `applyPlayerLogic` (movimento, carga, release, janela do golpe,
   tentativa de acerto).
3. **Bola**: lançamento do saque (`toss`) ou `stepBall`.
4. **Regras**: processa os eventos físicos (`processBounce`, `handleFence`) e
   atualiza placar/fases.

Fases (`world.phase`):

| Fase | O que acontece |
| --- | --- |
| `serve` | bola na mão do sacador (ou no ar, durante o toss) |
| `rally` | bola em jogo |
| `pointover` | pausa de 2,2 s (3,4 s em game/set) com anúncio e movimentação liberada; depois reinicia o saque |
| `matchover` | fim de partida (overlay + `R`/`M`) |

Cada passo produz `world.events` (consumido pelo cliente para som/efeitos):
`hit`, `swing`, `serve`, `toss`, `point`, `ball_bounce`, `ball_net`,
`ball_cross`, `ball_fence`.

### Colisões

- `resolvePlayerCollisions(world)`: separa companheiros que se encostam (ninguém
  ocupa o mesmo espaço). Os times ficam em lados opostos da rede, então só há
  colisão dentro do mesmo time.
- `checkPlayerBallCollision(world)`: a bola toca um jogador (raio de corpo
  0,25 m + raio da bola, abaixo de 1,8 m); se o jogador está **jogando a bola**
  (carga ou golpe ativo), o toque não conta. Se for o **parceiro** de quem bateu e
  a bola ainda não cruzou a rede nem quicou, o time perde o ponto na hora
  (`BATEU NO PARCEIRO`). Se for o **adversário** e a bola já quicou, o time dele
  perde o ponto (`BATEU NO JOGADOR`). Bola na mão ou em lançamento não conta.
- A checagem roda depois das regras de quique, para o segundo quique valer mais
  que um toque no corpo.

## 5. Golpes de rally

`release()` captura o tipo escolhido (`p.chargeShot`, memorizado durante a
carga) e cria `p.swing = { t, didHit, charge, shot }`. A janela ativa começa em
`SWING_WINDUP` (0,06 s) e dura `SWING_ACTIVE` (0,24 s).

`tryHit` valida: bola viva e livre, sem golpe já executado, **vez do time**
(`lastHit.team`), bola no próprio lado, altura ≤ 2,35 m e distância da raquete à
**trajetória** da bola (distância ponto-segmento, para não atravessar a bola).

`executeRallyShot` monta o golpe:

| Parâmetro | Flat | Top spin | Slice | Lob |
| --- | --- | --- | --- | --- |
| Profundidade do alvo | 4,5 a 10,9 m | 6,8 a 11,4 m | base × 0,92 | 10,6 m |
| Velocidade média | 9,5 a 18 m/s | idem | × 0,78 | idem + voo × 1,5 |
| Quique (`bounceScale`) | 1,0 | **1,3** | **0,5** | 0,95 |
| Erro | base | × 1,3 + 0,10 | × 0,85 | × 0,85 |
| Turbo | sim | sim | não | não |

Além disso:

- **Forehand/backhand** pelo lado do corpo: forehand × 1,04 de velocidade e
  × 0,85 de erro; backhand × 0,95 e × 1,30.
- **Erro**: humano `carga × 0,3`; IA `(1 − skill) × 0,4`; mais "pressão" que
  cresce com o tamanho do rally; mais um **shank** ocasional (chance
  `0,03 + (1 − skill) × 0,04`) com erro grande.
- **Alvo**: o alvo base é limitado a 0,5 m dentro das linhas e **depois** o erro
  é aplicado (pode tirar a bola); um limite generoso evita alvos absurdos.
- **Turbo**: carga ≥ 0,75 com reserva ≥ 30 → voo ~20% mais rápido, reserva
  consumida e efeito visual.
- **Situações (golpes fundamentais)**: além do tipo escolhido, cada golpe é
  classificado pela situação: `devolucao` (primeiro golpe após o saque),
  `voleio` (antes do quique, perto da rede), `smash` (antes do quique, acima de
  1,55 m), `meio-voleio` (até 0,15 m de altura e menos de 0,07 s após o quique) e
  `fundo`. Cada situação ajusta voo, alvo, erro, folga de rede e quique, e entra
  em `stats.situations`.
- **Vigor**: `STAMINA` em `constants.js` (máx. 100, corrida 32/s, **carga 16/s**,
  recarga 20/s, multiplicador 1,45, mínimo 12 para começar). A recarga só
  acontece no rally e sem estar carregando: **pausa no saque e no fim de ponto**.
  Abaixo de 25 (`LOW`) o jogador fica **cansado**: velocidade 82% e carga a 60%
  do ritmo (golpes mais fracos). Esgotado, precisa soltar o Shift para voltar a
  correr. A **IA também corre** quando precisa cobrir mais de 2,5 m e carrega
  igual, recarregando a 60% da taxa humana. A barra é desenhada sob os pés
  (menor e mais discreta para a IA).

### Segundo quique, ace e estatísticas

Em rally, `processBounce` não decide mais o ponto no primeiro quique fora:
`resolveRallyEnd` só encerra no **segundo quique** (primeiro quique fora = ponto
para quem recebeu; primeiro dentro = ponto para quem bateu, com **ACE** quando o
saque não foi tocado). A cerca foi para `y = ±20` e o jogador pode ir até 3,2 m
atrás da linha, então dá para buscar a bola antes do segundo quique;
`checkBallStopped` decide o ponto se a bola parar de rolar sem o segundo quique.

As estatísticas ficam em `stats` (total da partida), `setStats` (set atual),
`setHistory` (retrato de cada set encerrado) e `setSummary` (o set que acabou de
terminar, usado no painel de fim de set). `bump`/`bumpGroup` atualizam o total e o
set ao mesmo tempo; no fim do set o retrato é copiado e o set começa em branco.

### Stats e classes (`src/sim/stats.js`)

Quatro stats (força, técnica, saque e vigor), de 50 a 99, com 75 neutro
(multiplicadores 1,0). `resolvePlayerStats` resolve a configuração do menu:
preset de uma das **8 classes**, `random` (a CPU sorteia com o RNG da partida,
então é determinística por semente) ou `custom` (stats editadas, com clamp na
faixa). Os multiplicadores entram na velocidade da batida (`powerMul`), no erro
(`techniqueErrorMul`), na velocidade e na precisão do saque
(`serveSpeedMul`/`serveRiskMul`) e no vigor (`staminaMax`, `staminaDrainMul`,
`staminaRegenMul`). O `createWorld` aceita
`players: { a1: { classId, stats } }` para configurar cada slot.

Cada classe também tem **traços de IA** (`CLASS_TRAITS`): `net` (avanço à rede),
`depth` (jogar atrás/perto da linha), `aggression` e as preferências `spin`,
`slice` e `lob`. `homeSpot` usa `depth` e o avanço acumulado (`ai.approach`, que
sobe depois de um golpe profundo e decai com o tempo); `chooseShot` desloca as
probabilidades de batida e `chooseAimX` usa a agressividade para escolher o
canto.

## 6. Saque

- **Formação** (`formation`): sacador atrás da linha de fundo, no lado
  deuce/ad calculado por `score.serveSideSign()`; recebedor **fundo** (0,6 m
  antes da linha de fundo); parceiros na rede (duplas).
- **Lançamento**: `release` do sacador chama `startServeToss`, que joga a bola
  bem para o alto (carga do toss: `SERVE.TOSS_VZ_MIN/MAX` = 4,8 a 7,6 m/s). O
  `serve.stage` vai de `toss` para `hit`; a batida é o release do jogador perto
  do alto (`idealZ`, `SERVE.CONTACT_TOLERANCE`), com `tossQuality` definindo a
  qualidade do lançamento (`TOSS_IDEAL_MIN/MAX` = 0,6 a 0,9). A qualidade do
  toss e a altura do contato entram no erro e na força do saque. Se a bola cair
  abaixo de `SERVE.HIT_MIN_Z` sem batida, é falta.
  carga.
- **Tipos** (mesma tecla das batidas): alvo, velocidade, folga de rede, erro e
  `bounceScale` próprios (kick 1,35; slice 0,5).
- **Controle de direção**: `serveAimTarget(world, p, type)` calcula o alvo do
  saque (lateral de 0,15 a 4,0 m, profundidade de 0,3 a 6,1 m dentro da caixa,
  ajustadas pelo tipo) e é usado tanto pelo `executeServe` quanto pela **mira
  desenhada na quadra** para o sacador humano.
- **Falta/let/dupla falta**: `registerFault` e `replayServe`; ao repetir, o
  sacador volta à posição oficial (`serveSpot`) com velocidade zerada.
- **Ace**: `awardPoint` verifica se o último golpe foi um saque e o recebedor
  não tocou na bola (`serve.returned`).

## 7. Placar (`score.js`)

`MatchScore` implementa pontos, games, sets, tiebreak e rotação de saque:

- `awardPoint(team)` → lista de eventos (`point`, `game`, `set`, `tiebreak`,
  `match`) e cuida das transições.
- `serveSideSign(team)` → lado deuce/ad pela paridade dos pontos.
- `serviceTeamForPoint(n, first)` → rotação 1-2-2-2 do tiebreak.
- `gamesPlayed` → total de games (usado pela troca de lado).
- `teamServeIndex` → quantas vezes cada time sacou (rodízio interno das duplas).

`changeEnds(world)` (em `world.js`) troca os lados no modo Versus e **espelha o
placar** (pontos, games, sets, saque, histórico) para que ele acompanhe o
jogador.

## 8. IA (`ai.js`)

Cada CPU tem um controlador com estado (`createAI`). A cada frame:

1. **Reação**: quando o adversário bate, espera `reaction × (0,7 a 1,3)` antes de
   decidir.
2. **Plano de interceptação** (`planIntercept`), só quando é a **vez do time**:
   - prevê a trajetória e verifica se a bola vai **quicar fora**: se sim,
     deixa passar (`goingOut`);
   - escolhe o primeiro ponto **depois do quique** onde a bola está na altura de
     golpe (≤ 0,9 m), 1,2 m atrás do quique: evita correr à rede para volear
     bola baixa;
   - sem quique previsto, volta para a posição de espera (`homeSpot`).
3. **Duplas**: só o parceiro mais perto persegue a bola, cada um cobre a sua
   metade (`prefSide`) e quem não vai jogar uma bola que sairá sai da frente dela
   (`dodgeSpot`).
4. **Batida**: começa a carregar antes da bola chegar e solta no momento do
   impacto; o tipo é sorteado por `chooseShot` (top spin ~55%, flat ~25%,
   slice ~12%, lob ~8%) e a mira por `chooseAimX` (35% pelo centro, senão o lado
   aberto).
5. **Mira separada do movimento**: a IA usa `input.aim = { x, depth }`, então
   ela mira sem "andar" na direção da mira.
6. **Saque**: espera um tempo aleatório, escolhe o tipo (1º saque agressivo,
   2º mais seguro) e usa a mesma máquina de carga/toss.

Dificuldades (`constants.js`):

| Nível | skill | velocidade | reação |
| --- | --- | --- | --- |
| Fácil | 0,35 | 72% da humana | 0,34 s |
| Normal | 0,55 | 86% | 0,24 s |
| Difícil | 0,75 | 100% | 0,15 s |
| Injusto | 0,92 | 110% | 0,05 s |
| Impossível | 0,99 | 125% | 0,02 s |

## 9. Render (`render.js`)

Câmera **pinhole** atrás do time A: posição `(0, −(11,885+8), 5,2)`, olhando
para `(0, 1,5, 0,8)`. `project(view, x, y, z)` devolve a posição na tela e a
escala por profundidade.

- **Cena**: gradiente de céu, chão, quadra (trapézio), linhas e rede com altura
  real (malha, fita e postes).
- **Jogadores**: desenhados "em pé" (corpo + cabeça), com sombra; a **raquete
  fica sempre visível**, aponta para a bola (acompanhando a altura) e varre no
  golpe.
- **Bola**: círculo projetado na altura real + sombra no chão, rastro e marcas
  de quique; efeitos de impacto e etiquetas (`TOPSPIN • FOREHAND`).
- **Ordem de desenho**: tudo é ordenado por profundidade (mais longe primeiro),
  com a rede no meio.
- **HUD**: placar, tiebreak, mensagens, dica de saque: desenhado por cima em
  2D, junto com menu, pausa e fim de jogo.
- **Menu**: lista de opções com foco (modos, dificuldade, partida e **Como
  jogar**); `↑`/`↓` move o foco, `1` a `7` são atalhos, `Q`/`E` altera
  dificuldade/partida (modos usam `←`/`→`) e `Enter` confirma. A opção "Como
  jogar" abre a tela `drawHelp`, com controles, batidas, saque e regras em duas
  colunas.
- **Mira do saque**: `drawServeAim` desenha na quadra (tracejado amarelo) o
  ponto onde o saque vai cair, para o sacador humano; usa o mesmo
  `serveAimTarget` do golpe.
- **Estatísticas** (`drawSetSummary` e `drawGameOver`): no fim do set, um painel
  com as estatísticas daquele set; no fim do jogo, uma coluna por set mais o
  total, com a linha de batidas e os motivos dos pontos.
- **Tela de jogadores** (`drawPlayers`): lista os slots do modo com a classe de
  cada um e as quatro stats do jogador selecionado (setas mudam a classe ou
  ajustam a stat, Q/E ajustam de 5 em 5). **Carregamento** (`drawLoading`): antes
  da partida, mostra o modo, o formato, a dificuldade, a contagem de jogadores e
  um cartão por jogador com classe e stats, com barra de progresso (ENTER pula).
- **Ícones de ação** (`src/icons.js`): SVGs em `assets/icons/vectors/` para os
  golpes, saques, turbo, vigor, rede e tiebreak. `actionIcon(nome, mao)` troca
  para a variante `-plus` (forehand) ou `-minus` (backhand); neutro usa a versão
  normal. No HUD o rótulo do golpe virou ícone (com o turbo ao lado e a situação
  como legenda), e o ícone também aparece na barra de vigor, no tiebreak do
  placar e nas linhas da tela "Como jogar". Sem a imagem carregada (ou nos
  testes), o rótulo em texto continua como fallback.
- **Imagens de marca** (`src/media.js`): `assets/media/landing.png` é o fundo do
  menu, `logo.png` é o título e `logo-short.png` aparece no "Como jogar", na
  pausa, no fim de jogo e como marca discreta no canto da quadra. Os helpers
  `drawCover` e `drawContain` cuidam do enquadramento; enquanto a imagem não
  termina de carregar (ou em Node, nos testes), o desenho procedural continua
  sendo usado como fallback.

## 10. Entrada e áudio

- `input.js`: mapa por jogador (P1: WASD + Espaço/J/K/L; P2: setas +
  Enter/`,`/`.`/`/`, com aliases `Numpad 1/2/3`), `inputForSlot` e
  `pumpHumanInputs`.
- `audio.js`: efeitos sintetizados com WebAudio (saque, quique, rede, pontos,
  slice/lob, turbo): sem arquivos de áudio.
- `i18n.js`: tradução com tabelas planas em `src/lang/pt.js` e
  `src/lang/en.js`, `t(chave, params)` com substituição `{nome}` e detecção pelo
  idioma do navegador (`window.navigator.language`; padrão português, e nos
  testes em Node o padrão é determinístico). A troca acontece no menu, no item
  **Idioma** (`Q`/`E` ou `Enter`). As strings do cliente, das telas, do HUD e
  das mensagens do juiz saíram do código: o mundo emite códigos de motivo e o
  render traduz. A auditoria confere que pt e en têm exatamente as mesmas
  chaves.

## 11. Testes

```bash
npm test          # node:test: 131 testes
```

| Arquivo | Cobre |
| --- | --- |
| `tests/score.test.js` | pontos, deuce/AD, sets, tiebreak, rotação de saque, melhor de 3 |
| `tests/physics.test.js` | balística, quiques, rede (incl. raspão/let), cerca |
| `tests/world.test.js` | formação, saque válido, fault, dupla falta, let, quiques, fora, turnos, ace, reinício, 2º saque |
| `tests/shots.test.js` | flat/topspin/slice/lob, forehand/backhand, situações (voleio/smash/meio-voleio/devolução) |
| `tests/serve.test.js` | recepção funda, toss em 2 estágios, contato, tipos de saque |
| `tests/controls.test.js` | direções relativas à tela, mira |
| `tests/versus-ends.test.js` | troca de lado no Versus e placar seguindo o jogador |
| `tests/integration.test.js` | partidas CPU vs CPU completas, posicionamento da IA, tipos de batida/saque |
| `tests/stamina.test.js` | vigor/corrida (Shift), recarga e esgotamento |
| `tests/human.test.js` | jogador roteirizado usando o caminho de input do cliente |
| `tests/render.test.js` | câmera/projeção, HUD, raquete, efeitos, menu e tela "Como jogar" |
| `tests/client.test.js` | mapeamento de teclado e boot completo com DOM simulado |
| `tests/i18n.test.js` | idioma padrão, troca pt/en, parâmetros e paridade das chaves |
| `tests/icons.test.js` | selos +/-, nomes das variantes e presença dos arquivos |
| `tests/stats.test.js` | 8 classes na faixa, sorteio determinístico, multiplicadores e efeitos |
| `tests/mechanics.test.js` | slice com curva, devolução em duplas, Injusto/Impossível, sprint e vigor |

Como a simulação é determinística, os testes de integração usam **sementes
fixas** e comparam placares/estatísticas.

## 12. Como estender

**Adicionar um tipo de batida**

1. `input.js`: adicione a tecla e o campo no mapa do jogador.
2. `ai.js`: inclua o tipo em `chooseShot` (probabilidade) e na mira.
3. `world.js`: trate o tipo em `executeRallyShot` (alvo, velocidade, erro,
   `bounceScale`) e, se fizer sentido, em `executeServe`.
4. `main.js`: cor/rótulo/som do novo tipo.
5. `docs/REGRAS.md`: documente o comportamento.

**Adicionar um modo**

1. `world.js`: nova entrada em `MODES` (jogadores, humanos/IA, duplas).
2. `render.js`/`main.js`: nome no placar e entrada no menu.
3. Teste de integração rodando o modo.

**Balancear**

Quase tudo está em `src/sim/constants.js` (física, jogador, turbo, dificuldade)
e nos parâmetros de golpe em `world.js`. Os scripts de medição usados durante o
desenvolvimento (rallies por ponto, motivos de ponto, posicionamento da IA)
ficaram fora do repositório; os mesmos números podem ser obtidos rodando
`stepWorld` em um script próprio.

## 13. Limitações conhecidas

- Sem multiplayer em rede (o co-op é local, no mesmo teclado).
- A bola toca os jogadores só pela regra de colisão (sem empurrão nem bloqueio).
- Sem spin lateral real, vento ou efeitos de superfície.
- A troca de lado só existe no modo Versus.
- A IA compartilha o mesmo comportamento entre dificuldades, mudando apenas os
  parâmetros (sem "personalidade" por jogador).

## 14. Como evoluir os gráficos

### O que existe hoje

O jogo usa **Canvas 2D** com uma **câmera pinhole** própria (`computeView` e
`project` em `render.js`) e desenha tudo proceduralmente: quadra em trapézio,
rede com altura, jogadores como formas planas (corpo + cabeça + raquete) e bola
com sombra. Não há engine, malhas, iluminação ou animação esquelética; os
únicos assets são as imagens de marca em `assets/media/`.
O ponto forte é a separação: **a simulação não conhece o render**, então dá para
trocar o renderizador sem tocar na física, nas regras ou na IA.

### Ganhos rápidos (sem trocar de engine)

- Sombras mais suaves e direcionais (gradiente em vez de elipse sólida).
- Sprites 2D com membros articulados desenhados por cinemática (braços/pernas
  animados pelo estado do golpe).
- Partículas: poeira no quique, rastro do turbo, respingo de suor.
- Câmera dinâmica (zoom/pan leve seguindo a bola) e screen shake nos smashes.
- Texturas procedurais na quadra (gradiente, desgaste, marcas de saque).
- Iluminação falsa (vinheta, brilho no piso) e um HUD mais elaborado.

### Migração para 3D de verdade (Three.js)

1. **Renderizador WebGL consumindo o mesmo `world`**: adicionar `three` como
   única dependência de runtime e criar `render3d.js` com a mesma porta de
   entrada (`drawMatch(renderer, world, view, fx)`). O mapeamento é direto:
   `world.ball.x/y/z` já são coordenadas 3D (a quadra em `x`/`y` e a altura em
   `z`), então a cena nasce pronta.
2. **Cena e materiais**: quadra com textura (saibro/duro/grama), rede com malha
   e postes, céu com HDRI, luz direcional com **shadow map**, materiais PBR
   simples. A câmera pode ficar atrás do time A (como hoje) ou seguir a bola.
3. **Modelos e animação**: personagens **glTF com esqueleto** e clipes de
   `idle`, corrida, saque (toss), forehand, backhand, voleio, smash e
   meio-voleio. Um `AnimationMixer` escolhe o clipe pelo evento `hit` do mundo
   (`situation` + `hand` + `shot`) e sincroniza o impacto com o quadro da
   raquete; a raiz do modelo segue `player.x/y` e a rotação segue a direção da
   bola.
4. **Apresentação**: estádio com arquibancada (torcida instanciada), pós-processo
   (bloom no turbo, motion blur leve, DOF), replay com câmeras, LOD e áudio
   espacial.

### Assets e ferramentas sugeridas

- **Kenney** (pacotes de tênis/estádio, CC0) e **Quaternius** (personagens CC0)
  para começar sem custo.
- **Mixamo** para animações de tênis e **Poly Haven** para HDRIs.
- **Blender** para ajustar/riggar os modelos e exportar glTF.

### Cuidados ao migrar

- Manter o 2D como fallback (máquinas sem WebGL) e para os testes atuais, que
  usam um contexto falso; adicionar um smoke test do 3D com um renderer mockado.
- O render 3D é só visual: **não pode** influenciar a simulação (o determinismo
  dos testes depende disso).
- Controlar custo: instancing para a torcida, LOD para os personagens e limitar
  o shadow map à quadra.

### Ordem sugerida de trabalho

1. Ganhos rápidos no 2D (sombras, partículas, câmera).
2. `render3d.js` com quadra, rede, bola e caixas no lugar dos jogadores.
3. Modelos glTF + animações por evento.
4. Estádio, pós-processamento e replays.
