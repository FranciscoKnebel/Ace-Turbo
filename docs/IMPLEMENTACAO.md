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
| Restituição do quique | 0,62 × `bounceScale` | top spin 1,3; slice 0,5 |
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
- **Quique**: ao tocar o chão, `vz = −vz · 0,62 · bounceScale` e `vx/vy` são
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
slice 0,06; lob 0,50; saque flat 0,18; kick 0,45; lob 1,60).

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
| `pointover` | pausa curta e anúncio; depois reinicia o saque |
| `matchover` | fim de partida (overlay + `R`/`M`) |

Cada passo produz `world.events` (consumido pelo cliente para som/efeitos):
`hit`, `swing`, `serve`, `toss`, `point`, `ball_bounce`, `ball_net`,
`ball_cross`, `ball_fence`.

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
- **Erro**: humano `carga × 0,3`; IA `(1 − skill) × 0,5`; mais "pressão" que
  cresce com o tamanho do rally; mais um **shank** ocasional (chance
  `0,04 + (1 − skill) × 0,05`) com erro grande.
- **Alvo**: o alvo base é limitado a 0,5 m dentro das linhas e **depois** o erro
  é aplicado (pode tirar a bola); um limite generoso evita alvos absurdos.
- **Turbo**: carga ≥ 0,75 com reserva ≥ 30 → voo ~20% mais rápido, reserva
  consumida e efeito visual.

## 6. Saque

- **Formação** (`formation`): sacador atrás da linha de fundo, no lado
  deuce/ad calculado por `score.serveSideSign()`; recebedor **fundo** (0,6 m
  antes da linha de fundo); parceiros na rede (duplas).
- **Lançamento**: `release` do sacador chama `startServeToss`, que joga a bola
  para o alto (`SERVE.TOSS_VZ = 4,2 m/s`). Depois de `SERVE.TOSS_TIME = 0,42 s`,
  `executeServe` bate na bola **na posição em que ela está** (no alto).
  Durante o toss as regras de bola são ignoradas e o sacador não acumula nova
  carga.
- **Tipos** (mesma tecla das batidas): alvo, velocidade, folga de rede, erro e
  `bounceScale` próprios (kick 1,35; slice 0,5).
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
     golpe (≤ 0,9 m), com um pequeno recuo: evita correr à rede para volear
     bola baixa;
   - sem quique previsto, volta para a posição de espera (`homeSpot`).
3. **Batida**: começa a carregar antes da bola chegar e solta no momento do
   impacto; o tipo é sorteado por `chooseShot` (top spin ~55%, flat ~25%,
   slice ~12%, lob ~8%) e a mira por `chooseAimX` (35% pelo centro, senão o lado
   aberto).
4. **Mira separada do movimento**: a IA usa `input.aim = { x, depth }`, então
   ela mira sem "andar" na direção da mira.
5. **Saque**: espera um tempo aleatório, escolhe o tipo (1º saque agressivo,
   2º mais seguro) e usa a mesma máquina de carga/toss.

Dificuldades (`constants.js`):

| Nível | skill | velocidade | reação |
| --- | --- | --- | --- |
| Fácil | 0,35 | 45% da humana | 0,34 s |
| Normal | 0,55 | 56% | 0,24 s |
| Difícil | 0,75 | 66% | 0,15 s |

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

## 10. Entrada e áudio

- `input.js`: mapa por jogador (P1: WASD + Espaço/Z/X/C; P2: setas +
  Enter/`,`/`.`/`/`, com aliases `Numpad 1/2/3`), `inputForSlot` e
  `pumpHumanInputs`.
- `audio.js`: efeitos sintetizados com WebAudio (saque, quique, rede, pontos,
  slice/lob, turbo): sem arquivos de áudio.

## 11. Testes

```bash
npm test          # node:test: 80 testes
```

| Arquivo | Cobre |
| --- | --- |
| `tests/score.test.js` | pontos, deuce/AD, sets, tiebreak, rotação de saque, melhor de 3 |
| `tests/physics.test.js` | balística, quiques, rede (incl. raspão/let), cerca |
| `tests/world.test.js` | formação, saque válido, fault, dupla falta, let, quiques, fora, turnos, ace, reinício, 2º saque |
| `tests/shots.test.js` | flat/topspin/slice/lob, forehand/backhand, estatísticas |
| `tests/serve.test.js` | recepção funda, toss com batida no alto, tipos de saque |
| `tests/controls.test.js` | direções relativas à tela, mira |
| `tests/versus-ends.test.js` | troca de lado no Versus e placar seguindo o jogador |
| `tests/integration.test.js` | partidas CPU vs CPU completas, posicionamento da IA, tipos de batida/saque |
| `tests/human.test.js` | jogador roteirizado usando o caminho de input do cliente |
| `tests/render.test.js` | câmera/projeção, HUD, raquete, efeitos, menu |
| `tests/client.test.js` | mapeamento de teclado e boot completo com DOM simulado |

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
- A bola não interage com os jogadores ("trombada").
- Sem spin lateral real, vento ou efeitos de superfície.
- A troca de lado só existe no modo Versus.
- A IA compartilha o mesmo comportamento entre dificuldades, mudando apenas os
  parâmetros (sem "personalidade" por jogador).
