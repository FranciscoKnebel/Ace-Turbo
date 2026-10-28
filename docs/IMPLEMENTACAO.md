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

| Caminho | Responsabilidade |
|---|---|
| `src/main.js` | Entrada e reexportação de `boot` |
| `src/app/controller.js` | Telas, loop fixo, efeitos e ciclo de vida |
| `src/app/menu.js` | Modelo e configuração dos menus |
| `src/app/messages.js`, `accessible-ui.js` | Tradução tardia e apresentação HTML |
| `src/input.js`, `src/sim/contracts.js` | Teclado, fila por tick e contratos |
| `src/render.js`, `src/view/` | Fachada, câmera, cena, HUD, telas e layouts |
| `src/view/pixi/`, `assets/vendor/` | Camada WebGL da cena (PixiJS vendado) e pintor que fala Canvas 2D |
| `src/assets/image-cache.js`, `media.js`, `icons.js` | Imagens, falhas e retry |
| `src/audio.js` | Contexto, vozes, silêncio e descarte por instância |
| `src/sim/world.js` | Criação da partida e ordem explícita dos sistemas por tick |
| `src/sim/serve.js`, `shots.js`, `rules.js` | Preparação/execução do saque, contato e arbitragem da bola |
| `src/sim/service-order.js` | Rotação de time/parceiro nos games e blocos do tiebreak |
| `src/sim/systems/` | Jogadores, energia, movimento, golpes, pontos e telemetria |
| `src/sim/physics/kernel.js`, `physics.js` | Execução e previsão com o mesmo núcleo |
| `src/sim/geometry.js`, `court-sides.js`, `service.js` | Linhas, lado físico e rodízio |
| `src/sim/config.js`, `shot-profiles.js`, `constants.js` | Opções validadas e parâmetros |
| `src/sim/score.js`, `stats.js`, `rng.js`, `math.js` | Placar, atributos, RNG e balística |
| `src/sim/ai/`, `ai.js` | Percepção, planejamento, claim, golpes e execução |
| `scripts/lib/match-runner.mjs` | Partidas reproduzíveis com resultados/timeout |
| `scripts/balance-matrix.mjs` | CLI e relatório de equilíbrio |
| `scripts/serve.js` | GET/HEAD dos arquivos públicos, loopback por padrão |
| `.github/workflows/ci.yml` | Testes e auditoria em todas as bases de PR |

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
| Cerca | `|y| > 20` ou `|x| > 12` | encerra a jogada |
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
slice 0,06; lob 0,50; saque: flat 0,12; kick 0,45; slice 0,06; power 0,08).

O saque usa um voo base de `lerp(14, 24, charge)` dividido pelo fator do tipo
(flat 1, kick 0,92, slice 0,78, power 1,12): o flat sai forte (até ~25 m/s com
carga alta), o slice sai visivelmente mais lento e o power é o mais rápido. `timeForNetHit` resolve o
inverso: o tempo de voo para a bola cruzar a rede exatamente em uma altura alvo
(usado pelo "saque errado" para mirar a fita, gerando fault ou let).

## 4. Loop e fases da partida

`app/browser.js` roda `requestAnimationFrame`; `app/controller.js` avança o tempo injetado com acumulador e passo fixo de **1/120 s**
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

- **Forehand/backhand** pelo lado do corpo: forehand × 1,05 de velocidade e
  × 0,85 de erro; backhand × 0,95 e × 1,30; neutro (bola no corpo) × 0,86 e
  × 1,45.
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
- **Vigor**: `STAMINA` em `constants.js` (máx. 100, sprint 26/s, corrida normal
  3,5/s acima de 80% da velocidade, `CHARGE_DRAIN` 5/s só até a carga encher,
  cargas do saque a 30% (`SERVE_CHARGE_MUL`), batida 2 (`HIT_COST`, +2
  esticado), recarga 8/s em ritmo lento, IA a 60%, multiplicador 1,45, mínimo
  12 para começar). A recarga só acontece no rally, em ritmo lento e sem estar
  carregando: **pausa no saque**. Na pausa entre pontos há uma recuperação
  extra de `PAUSE_REGEN_MIN/MAX` (12% a 28% da barra, conforme o stat de vigor),
  distribuída ao longo da pausa (`world.pauseDuration`); o sacador do ponto
  recebe `PAUSE_REGEN_SERVER` (2x), porque gastou no saque e joga o rally em
  desvantagem.
  O cansaço é **gradual** (`TIRED_FROM` 0,6): velocidade e ritmo de carga caem
  proporcionalmente até 82% (`LOW_SPEED`) e 60% (`LOW_CHARGE`) com a barra
  vazia; abaixo de `LOW` (25% da barra) a barra fica vermelha. Esgotado, precisa
  parar para recuperar antes de voltar a correr. A **IA também corre** quando
  precisa cobrir mais de 2,5 m e carrega igual, recarregando a 60% da taxa
  humana. A barra é desenhada sob os pés (do mesmo tamanho para humanos e IA).

- **Queima por forçar o corpo** (`STAMINA.BURN_MAX/BURN_MIN`): o gasto passa
  por `spendStamina(p, amount, burn)`; só o sprint liga `burn` (corrida, carga e
  batida não queimam). Com a barra abaixo de `TIRED_FROM`, parte do sprint vira
  `p.burn` (25% com vigor 50, 10% com vigor 99). `staminaMaxOf` soma fadiga e
  queima com piso de `FATIGUE.MIN_MUL` (50% do máximo inicial).
- **Fadiga de partida** (`FATIGUE`): ao fim de cada set, `applySetFatigue`
  encolhe a barra máxima (`p.fatigue`): 9% por set com vigor 50, 6% com 75 e 3%
  com 99, limitada a 50% do máximo. `staminaMaxOf` devolve a barra efetiva e é
  usada no clamp, na recarga e no desenho. A cor da barra sai de
  `staminaBarColor` (azul, âmbar a partir de `TIRED_FROM` e vermelho abaixo de
  `LOW`); abaixo do limite a barra pulsa (sem rótulo).

### Menu e configurações (`app/menu.js` e `view/menu.js`)

O menu principal (`menuRows`) tem só os quatro modos e os atalhos
**Configurações**, **Jogadores** e **Como jogar** (com atalhos numéricos 1-7). As
opções de partida ficam em `drawSettings`, com as categorias de
`SETTINGS_CATEGORIES` (Partida, Quadra e Geral) e as linhas montadas por
`settingRow`; o estado vive em `menu.settings = { category, focus }` e o input
(`app/controller.js`) usa `↑`/`↓` para a linha, `←`/`→` para a categoria, `Q`/`E` para o
valor (via `cycleSetting`) e `Enter`/`Esc` para voltar.

### Formatos (`MatchScore`)

`createWorld({ bestOf, noAd, superTiebreak })` repassa as opções para o
`MatchScore`: `bestOf` 1, 3 ou 5 (`setsToWin` 1, 2 ou 3), `noAd` fecha o game em
40-40 (o próximo ponto vence, sem vantagem) e `superTiebreak` transforma o set
decisivo em um tiebreak de `tbTarget` 10 pontos (o normal é 7), com o mesmo
rodízio de saque do tiebreak (`serviceTeamForPoint`): o primeiro sacador é quem
sacaria o game seguinte, o bloco 1 usa o próximo parceiro da rotação nas duplas
(`tbServeBlocks`) e o set seguinte começa com quem recebeu o primeiro ponto. O menu guarda
`bestOfIndex`, `finalSetIndex` e `scoringIndex` e mostra o formato na tela de
carregamento.

### Golpes só em jogo

Golpes e carga só valem nas fases `serve` e `rally`: `tryHit`, `executeRallyShot`
e o bloco de carga de `applyPlayerLogic` checam a fase. Ao encerrar o ponto,
`awardPoint` limpa `swing` e `charging` de todos os jogadores. Sem isso, um
swing que estava ativo quando o ponto terminava acertava a bola na pausa e o
`executeRallyShot` revertia a fase para `rally`, cancelando o `pointover`: o
ponto (por exemplo, um **ace**) era contabilizado mas o jogo não voltava para o
saque.

### Superfícies (`SURFACES`)

A quadra é escolhida no menu (`createWorld({ surface })`) e a bola carrega
`ball.surface`: no quique, `stepBall` multiplica a restituição por `bounce` e o
atrito do chão por `keep` (duro 1/1; saibro 1,12/0,92; grama 0,86/1,1). A
`predictTrajectory` usa os mesmos fatores, então a IA prevê o quique da
superfície escolhida. No render, `drawCourt(ctx, view, surface)` troca a paleta
da quadra (azul, saibro laranja, grama verde) e o menu desenha a quadra com a
seleção atual como prévia.

### Clima e vento (`WEATHERS`, `WIND`)

`createWorld({ weather })` resolve o clima (`resolveWeather`): **Noite** e
**Dia** não têm vento; **Ventania** sorteia uma intensidade (`WIND.MIN/MAX` =
0,5 a 1,3 m/s²) e uma direção (componente principal em `y`, lateral em `x` pelo
fator `WIND.CROSS`); **Aleatório** sorteia entre os três. A bola carrega
`ball.wind` e o `substep` soma `wind * dt` à velocidade (a `predictTrajectory`
faz o mesmo, então a IA prevê a bola com vento). O alvo dos golpes e do saque é
compensado por `0,5 * a * t² * WIND.COMPENSATION` (0,85), deixando 15% de
resíduo para o vento ainda exigir ajuste. No render, `SKY` define as
paletas de céu/chão de dia e de noite, `drawWeatherBadge` desenha o ícone do
clima (sol/lua/vento) e a seta com a intensidade, e `drawWind` desenha
partículas na direção do vento usando `world.elapsed`.

### Segundo quique, ace e estatísticas

Em rally, `processBounce` decide **na hora** quando o primeiro quique é **fora**
(ponto para quem recebeu). Um quique **dentro** não encerra: `resolveRallyEnd`
só fecha no **segundo quique** (ponto para quem bateu, com **ACE** quando o
saque não foi tocado), o que deixa o jogador buscar uma bola funda. A cerca foi para `y = ±20` e o jogador pode ir até 3,2 m
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
(`serveSpeedMul`/`serveRiskMul`) e no vigor (`staminaMax` ±25%, `sprintDrainMul`
±35% só no sprint, `staminaDrainMul` ±20% nos demais gastos e `staminaRegenMul`
±25%; o velocista tem saque 75 e técnica 78 para o vigor 99 ser a identidade,
não a única stat).

No erro de execução (`executeRallyShot`) entra a **bola pesada**: acima de
`PHYS.HEAVY_SPEED` (13 m/s) o erro de quem devolve cresce `HEAVY_ERROR` por m/s
(com teto `HEAVY_MAX`) e é amenizado por `heavyResistMul` (força: ±25%). Na IA,
a folga de alcance (`canReach`) encolhe até 35% com a velocidade da bola (menos
na devolução de saque, que já vem rápida), então bola rápida vira winner. O `createWorld` aceita
`players: { a1: { classId, stats } }` para configurar cada slot.

**Jogo de rede** (`NET` em `constants.js`): `planIntercept` tenta o `volleyPick`
antes do golpe de fundo quando o jogador está adiantado (`|y| < NET.VOLLEY_Y`):
o contato acontece **antes do quique**, na altura de voleio (`NET.VOLLEY_BALL_Y`)
e perto da rede. Quem está no fundo segue esperando o quique. O avanço
(`ai.approach`) acumula depois de um golpe profundo **e sólido** (`holdTarget >=
0,6`), decai em `NET.DECAY` e vira **saque-e-voleio** para quem tem traço de rede
alto (`NET.SERVE_VOLLEY_*`); o sacador em saque-e-voleio não recua para a linha
de fundo. O smash sai `NET.SMASH_SPEED` mais forte, e quem tem um adversário
adiantado sofre `NET.PRESSURE` de erro extra (precisa mirar fino para passar).

**Julgamento de bola fora** (`JUDGE`): a previsão da IA é exata, então o
`planIntercept` soma uma **margem de dúvida** (`OUT_MARGIN` 0,35 m com
`OUT_JITTER` de ±25%): só marca `goingOut` quando a bola passa da margem
(`courtOutDistance`/`boxOutDistance`, já descontando o raio da bola). Dentro da
margem a bola fica marcada como `doubtful`, o jogador vai nela e o `chooseShot`
joga seguro (mais slice/lob e `hold` 20% menor). O `isInCourt` considera a bola
que **toca a linha** (centro até um `PHYS.BALL_RADIUS` além).

**Reação à rede**: `netOpponents(world, player)` conta os adversários adiantados
(`|y| < NET.VOLLEY_Y`). Com pelo menos um, `chooseShot` soma `NET.COUNTER_LOB`
(0,22) à chance de lob e `chooseAimX` tira `NET.COUNTER_CENTER` (0,18) da chance
de mirar o centro (a mira vira passada). É a única leitura de posicionamento
adversário na escolha da batida; o resto continua vindo dos traços da classe.

Cada classe também tem **traços de IA** (`CLASS_TRAITS`): `net` (avanço à rede),
`depth` (jogar atrás/perto da linha), `aggression` e as preferências `spin`,
`slice` e `lob`. Cansada (`tirednessOf`), a IA fica conservadora: `chooseShot`
aumenta slice/lob, reduz a força (`hold`) e mira mais curto; `chooseAimX` joga
mais pelo centro e o avanço à rede (`ai.approach`) não acumula.
`homeSpot` usa `depth` e o avanço acumulado (`ai.approach`, que
sobe depois de um golpe profundo e decai com o tempo); `chooseShot` desloca as
probabilidades de batida e `chooseAimX` usa a agressividade para escolher o
canto. Em duplas, `planIntercept` devolve `null` para o parceiro do recebedor
enquanto `serve.returnPending`: ele não persegue a bola do saque, porque só o
recebedor designado pode devolver.

Na escolha da mão, a IA **abre para o forehand**: o alvo de interceptação sai
da linha da bola por `FOREHAND_OFFSET` (0,9 m) quando a bola está no lado do
forehand ou quando há tempo (`slack > 0,95 s`); caso contrário, ela encaixa o
backhand ficando 0,45 m à frente da linha da bola (`lateral < 0`). A posição de
espera também é deslocada (`ball.x * 0,6 - 0,6` no referencial do time). O
`lateral` é calculado em `executeRallyShot` e o neutro (bola no corpo) passou a
ser punido: velocidade ×0,86 e erro ×1,45 (o pior caso; forehand ×1,05/×0,85 e
backhand ×0,95/×1,3).

Durante o saque (preparação e devolução) a IA usa a **posição de formação**
guardada em `formation()` (`player.homeX/homeY`): o recebedor espera fundo e os
parceiros ficam na rede, sem seguir a bola (que no toss está do outro lado da
quadra). O recebedor tem a preferência no claim da devolução e espera a bola na
altura da linha de fundo (`deepPick`, com a referência na formação, não na
posição atual). O sacador recupera para o **centro da linha de fundo** depois do
saque, para cobrir a devolução cruzada. A formação também grava
`player.pointSide` (o lado de cada um naquele ponto); `homeSpot` usa esse lado
(e não o `prefSide` fixo) na cobertura das duplas, então ninguém cruza a quadra
para voltar ao lado preferido no meio do rally. `planIntercept` não planeja nada durante
a preparação do saque, e quem não vai jogar uma bola que vem em cima sai da
frente (`dodgeSpot`). O gate `canReach` (carregar só quando dá para chegar)
mantém uma folga de `PLAYER.REACH + 1,5 m`, senão bolas alcançáveis no limite
ficavam sem tentativa. A IA só **começa a carregar** se `canReach`
for verdadeiro (distância até a interceptação dentro do tempo, com sprint):
bola inalcançável ou do parceiro não gasta vigor. Durante o saque (bola em
voo), o **recebedor** é preso atrás da linha de saque em `applyPlayerLogic`
(`COURT.SERVICE_LINE`): nada de invadir a caixa antes do quique.

## 6. Saque

- **Replay** (`replayServe`): depois de uma falta ou de um let, `formation`
  reposiciona todo mundo (sacador, recebedor e parceiros) e as velocidades são
  zeradas: o 2º saque sai das posições de saque, não de onde os jogadores
  pararam.
- **Formação** (`formation`): sacador atrás da linha de fundo, no lado
  deuce/ad do sacador pelo lado físico (`serviceSign` com `p.side ?? p.team`); recebedor **fundo** (0,6 m
  antes da linha de fundo); parceiros na rede (duplas).
- **Lançamento**: `release` do sacador chama `startServeToss`, que joga a bola
  bem para o alto (carga do toss: `SERVE.TOSS_VZ_MIN/MAX` = 4,8 a 7,6 m/s). O
  `serve.stage` vai de `toss` para `hit`; a batida é o release do jogador **na
  queda**, na altura ideal (`CONTACT_IDEAL` = 0,88 do pico, com
  `SERVE.CONTACT_TOLERANCE`), e `tossQuality(charge, serveStat)` define a
  qualidade do lançamento: a área (`TOSS_IDEAL_MIN/MAX` = 0,6 a 0,9) vale 90%+ e
  a área interna (`TOSS_PERFECT_MIN/MAX` = 0,02 a 0,09 de meia-largura, crescendo
  com o stat de saque) vale 100%. Bater na **subida** multiplica a qualidade
  por `SERVE.RISE_PENALTY` (0,4): o saque sai fraco e impreciso. A IA espera a
  bola passar do alto e só solta com `vz < 0`. A qualidade do toss e o contato
  entram no erro e na força do saque. Se a bola cair abaixo de
  `SERVE.HIT_MIN_Z` sem batida, é falta. A UI do estágio 2 não usa gauge: o
  rótulo perto da bola mostra SEGURE/BATA/TARDE e um aro verde marca a janela.
- **Tipos** (mesma tecla das batidas): flat, top spin (kick), slice e **power**
  (a tecla do lob vira um saque de força, `speedMul` 1,12 e mais erro), com
  alvo, velocidade, folga de rede, erro e `bounceScale` próprios.
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
- `serveSideSign(side)` → lado deuce/ad pela paridade dos pontos, no lado
  físico do sacador (`p.side ?? p.team`).
- `serviceTeamForPoint(n, first)` → rotação 1-2-2-2 do tiebreak.
- `gamesPlayed` → total de games (usado pela troca de lado).
- `teamServeIndex` → quantas vezes cada time sacou (rodízio interno das duplas).

`changeEnds(world)` (em `service.js`, reexportado por `world.js`) troca apenas
`player.side` e a orientação lateral. `player.team` é identidade estável.
Placar, saque e snapshots históricos mantêm os mesmos times; `teamAt(world,y)`
converte uma metade física em time lógico para a arbitragem.

## 8. IA (`ai/`, fachada `ai.js`)

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

## 9. Render (`view/`, fachada `render.js`)

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
- **Menu**: quatro modos, **Configurações**, **Jogadores** e **Como jogar**;
  `↑`/`↓` move o foco, `1` a `7` são atalhos e `Enter` confirma. Em
  **Configurações** (`drawSettings`), `←`/`→` troca a categoria, `↑`/`↓`
  seleciona a opção e `Q`/`E` altera seu valor. `Enter`/`Esc` volta ao menu.
  **Como jogar** abre `drawHelp`, com controles, batidas, saque e regras.
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
npm test              # node:test: suíte de testes
npm run audit:docs    # docs x código x testes
npm run balance:matrix  # matriz de equilíbrio das classes (ver abaixo)
```

| Arquivo | Cobre |
| --- | --- |
| `tests/score.test.js` | pontos, deuce/AD, sets, tiebreak (7 e super de 10), rotação de saque, melhor de 3 e de 5, no-ad |
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

O **`scripts/balance-matrix.mjs`** (npm run balance:matrix) roda a matriz de
classes contra classes nas cinco dificuldades, com vitórias, games e break
points, e tem o modo focado (`--class X --seeds N`) para decisões finas de
balanceamento (a matriz tem células pequenas e ruidosas).

Como a simulação é determinística, os testes de integração usam **sementes
fixas** e comparam placares/estatísticas.

## 12. Como estender

**Adicionar um tipo de batida**

1. `input.js`: adicione a tecla e o campo no mapa do jogador.
2. `ai.js`: inclua o tipo em `chooseShot` (probabilidade) e na mira.
3. `systems/rally.js`: trate o tipo em `executeRallyShot` (alvo, velocidade, erro,
   `bounceScale`) e, se fizer sentido, em `executeServe`.
4. `app/controller.js`: cor/rótulo/som do novo tipo.
5. `docs/REGRAS.md`: documente o comportamento.

**Adicionar um modo**

1. `config.js`: nova entrada em `MODES` (jogadores, humanos/IA, duplas).
2. `app/menu.js` e `view/hud.js`: nome no placar e entrada no menu.
3. Teste de integração rodando o modo.

**Balancear**

Quase tudo está em `src/sim/constants.js` (física, jogador, turbo, dificuldade)
e em `shot-profiles.js`/`systems/rally.js`. O runner em
`scripts/lib/match-runner.mjs` oferece resultados, timeouts e break points;
`balance-matrix.mjs` expõe o CLI. Veja `VALIDACAO-REFATORACAO.md` para dados e
limites da comparação de física desta pilha.

## 13. Limitações conhecidas

- Sem multiplayer em rede (o co-op é local, no mesmo teclado).
- A bola toca os jogadores só pela regra de colisão (sem empurrão nem bloqueio).
- Sem spin lateral fora do slice (curvatura); vento e superfícies existem, mas
  não há sol/desafio de vídeo (hawk-eye).
- A troca de lado só existe no modo Versus.
- As dificuldades mudam os parâmetros (skill, velocidade, reação); a
  "personalidade" vem dos traços da classe (rede, profundidade, agressividade,
  slice/lob).

## 14. Como evoluir os gráficos

### O que existe hoje

O jogo usa **Canvas 2D** com uma **câmera pinhole** própria (`computeView` e
`project` em `render.js`) e desenha tudo proceduralmente: quadra com
sombreamento de profundidade e textura por superfície, rede com cordas
verticais, jogadores articulados (pernas com passada, braços, inclinação na
corrida), bola com sombra difusa e rastro de velocidade e partículas no
mundo (poeira de quique da cor da superfície, faíscas de smash e turbo). Há
câmera dinâmica amortecida (`followView`: pan e zoom leves seguindo a bola,
com o HUD imóvel na view original), céu noturno com estrelas determinísticas,
horizonte contínuo e vinheta de iluminação. A cena pode rodar por cima de uma
camada **WebGL** com PixiJS vendado (plano C, abaixo) ou no Canvas 2D integral
como fallback. Não há malhas, iluminação real, animação esquelética nem
sprites; os assets são as imagens de marca em `assets/media/` e o módulo
vendado `assets/vendor/pixi.min.js` (sem build, zero dependências de npm). A
simulação continua sem conhecer o
render: a câmera dinâmica vive em `camera.js`, os efeitos em `fx` do cliente
(`dust` e `sparks`) e nada disso entra no mundo.

### Camada de cena em WebGL (plano C: PixiJS vendado)

- `drawScene(painter, ...)` corre em dois motores: no Canvas 2D integral
  (fallback) ou numa camada PixiJS 8.22 em WebGL. O browser cria no boot um
  canvas "colado" (position fixed, `pointer-events: none`) e carrega o módulo
  vendado por import dinâmico; o `#game` é elevado explicitamente em z-index
  para ficar acima da cena (com z-index negativo o layer do WebGL não é
  composto em todos os ambientes testados).
- Com WebGL ativo, o 2D limpa a área do mundo e desenha só o HUD (placar,
  mensagens, pausa); com `?renderer=2d`, sem WebGL, ou se o import/init
  falhar, o canvas colado é removido e o jogo segue no fallback 2D integral.
  Falhas em desenho/render ou resize descartam a cena; o mesmo quadro volta
  ao 2D integral e o loop continua. Inicialização tardia após dispose também
  descarta a cena; após resize durante o carregamento usa viewport/DPR atuais.
  Se o Pixi selecionar um backend Canvas por falta de WebGL, sua cena é
  descartada e o Canvas 2D nativo do jogo assume integralmente.
  A camada decorativa é `aria-hidden`; os controles HTML mantêm a navegação
  acessível sem o listener global de Tab do Pixi.
- O pintor (`painter.js`) mantém a semântica do Canvas 2D (save/translate/
  restore, buffer de path até fill/stroke, `drawImage` e fatiamento de
  arcos/linhas para a mira tracejada) e fala com um adaptador tipo gravador;
  nos testes o adaptador é gravador puro, sem Pixi. No browser, `scene.js`
  traduz para `Graphics`/`Sprite`/`Text` reutilizando objetos entre quadros
  (pools de Graphics/Sprite, Text por chave, Texture por imagem via WeakMap e
  `FillGradient` por chave, com eviction apenas de gradientes não usados há
  2+ quadros: instruções vivas mantêm referência no meio do quadro).
  O descarte libera também pools e textos destacados. Elipses parciais ou
  rotacionadas usam curvas cúbicas: `Graphics.ellipse` só aceita centro/raios.
- `node scripts/browser-graphics.mjs` verifica WebGL real quando disponível,
  arcos parciais, falha de GPU com fallback no mesmo quadro e `?renderer=2d`.
  Os cenários de gameplay acelerado usam 2D; os demais testes de navegador continuam
  usando a seleção automática de renderer. A disponibilidade de WebGL fica
  explícita no relatório de gráficos.
- Armadilha documentada do Pixi vendado: `fill({ fill: '<css>', alpha })`
  ignora a cor e pinta branco. O caminho sólido é `g.fill({ color, alpha })`
  e o gradiente entra por `g.fill({ fill: gradient, alpha })`; `rgba()` é
  convertido para hex mais alpha separado em `colorOf`. Gradientes radiais
  transparentes também exigem repintar a textura sem o fundo do último stop
  que o Pixi 8.22 aplica: esse fundo escureceria até o centro da vinheta.
  A suíte de gráficos verifica pixels transparentes no centro e alpha na borda.

### Ganhos rápidos (sem trocar de engine)

Implementados nesta rodada:

- Sombras suaves e direcionais (gradiente radial da bola e dos jogadores).
- Membros articulados desenhados por cinemática (pernas na passada, braços
  soltos, inclinação no sprint e riscos de velocidade).
- Partículas: poeira no quique (cor da superfície), faíscas no smash e no
  turbo; rastro e screen shake já existiam.
- Câmera dinâmica amortecida (pan e zoom leves seguindo a bola).
- Texturas procedurais na quadra: sombreamento de profundidade, faixas de
  grama, grãos de saibro e desgaste no duro.
- Iluminação falsa: vinheta por horário, estrelas na noite, horizonte
  contínuo e refletor no horizonte.

Pendências dessa trilha:

- Sprites 2D no lugar das formas (personagens com caráter visual).
- HUD mais elaborado e respingo de suor/impacto extra.
- Rotação visível da bola e squash no impacto.

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

## 14. Contratos e manutenção

`normalizeMatchOptions` é a fronteira pública de opções: modos, dificuldade,
seed, formato, superfície, clima e booleanos têm defaults coerentes com os
metadados. Presets e traços são copiados por jogador. Mensagens da simulação
são `{key,params}`; motivos são códigos estáveis (`ace`, `doubleBounce`, `out`,
`partner` etc.). `app/messages.js` traduz ao apresentar, sem dependência de
idioma dentro de `sim/`.

O teclado mantém estado de teclas e fila de transições de golpe por jogador.
Cada tick consome uma transição, preservando um tap ocorrido entre RAFs;
`blur` limpa teclas, bordas e filas. Eventos em controles HTML ficam no DOM.

A previsão usa o mesmo `stepBall` da execução, em cópia privada da bola,
com rede/fita, quique, atrito, superfície, vento e cerca. Duas novas batidas
no chão encerram a previsão; o número de amostras não limita o horizonte.
A IA reutiliza previsões entre parceiros no mesmo tick e arbitra o claim por
referência comum e desempate de id.

A integração de PRs deve seguir a ordem da pilha. CI roda em qualquer base de
PR, com `npm test` e `npm run audit:docs`. A auditoria documental ainda usa
verificações de presença/constantes, complementadas por testes comportamentais,
replay, paridade física, limites de layout, servidor e ciclo de vida. A auditoria
não substitui teste de regra nem revisão visual real.

Transições de fase passam por `systems/phases.js`, com tabela de transições
permitidas. A entrada na pausa atualiza fase, duração e flags do saque em uma
operação. `stepWorld` rejeita ticks não finitos, não positivos ou maiores que
50 ms antes de modificar o estado; o cliente e o runner usam 1/120 s.

## Complemento de contratos da simulação

`systems/phases.js` expõe estados diagnósticos de preparação, toss, voo,
devolução pendente, rally, pausa e fim, preservando os campos públicos antigos.
`assertMatchInvariants()` verifica identidades, tentativa, flags e posse da
bola nas fronteiras de tick; o runner chama a verificação a cada 120 ticks.
Não exige bola fisicamente imóvel na pausa: a bola ainda pode rolar.

`systems/telemetry.js` reduz eventos síncronos sobre total e set corrente.
`METRICS` documenta unidade e origem de todos os campos. O nome legado
`tossQualitySum` é uma soma de qualidade ajustada: o lançamento soma sua
qualidade, e um contato executado corrige essa parcela para a qualidade final;
um toss perdido mantém a qualidade do lançamento. Não é uma média exclusiva
de contatos. A fórmula foi preservada. Pontos contam uma vez, antes de
snapshot/reset do set; testes verificam total = sets encerrados + set atual.

A previsão informa `termination` (`horizon`, `twoBounces` ou `dead`),
`elapsed` e `horizon`; atingir dois novos quiques é uma parada deliberada,
sem ocultar o motivo do horizonte menor. Inputs, eventos, mensagens, opções
e world têm contratos JSDoc em `sim/contracts.js`.

## Controlador e plataforma

`app/controller.js` exporta `createController()`, sem DOM, Canvas, listeners
ou RAF. Recebe teclado, leitura de inputs, áudio, relógio e callback de idioma;
sem adaptadores, permite testar comandos e avanço por tempo diretamente no Node.
`app/browser.js` implementa `boot()` e possui Canvas, render, resize/blur, RAF
e descarte dos adaptadores. `main.js` preserva sua API pública de boot.

`app/settings.js` declara uma opção uma vez: valores válidos, default,
propriedade de navegação, categoria e chaves de tradução. O mesmo descriptor
alimenta defaults, ciclo, rótulos e `matchOptionsFor()`. `settingsSnapshot()`
expõe valores canônicos consultáveis; índices permanecem apenas na navegação.
O cliente começa em co-op/Fácil/um set; a API da simulação usa
Simples/Normal/três sets. Essa diferença é intencional.

## Diagnósticos da IA e experimentos

`ai/diagnostics.js` permite `observeDecisions(world, observer)` e
`decisionTrace(world)`: registra mudanças de motivo (bola julgada fora com
distância/margem, claim do parceiro, ausência de contato no horizonte e carga
expirada). O buffer tem no máximo 200 entradas, fica fora do estado/RNG e
pode ser desligado. Sem observador, não acumula logs. Os parceiros usam uma
referência comum mesmo quando não há quique no horizonte; `claimOwner()`
calcula/cacheia um único dono por time e referência no tick.

Relatórios do CLI usam schema 2 e perfil `shared-physics-v1`, com seed range,
protocolo e número de simulações únicas. Configurações espelhadas repetidas
reutilizam a mesma execução. O runner guarda séries de duração ativa de ponto
(excluindo pausa entre pontos) e hits por rally (saque excluído), além da energia
final. Distribuições min/p10/mediana/p90/max/média incluem só partidas completas.
O intervalo de vitória usa bootstrap percentil de 95% por seed, mantendo os
dois lados agrupados e excluindo clusters com qualquer timeout. Com menos de
duas seeds completas, o intervalo é explicitamente indisponível. Uma amostra
pequena continua insuficiente para afirmar equilíbrio ou recalibrar classes.
`--mode singles` usa CPU nos slots humanos; `--best-of` aceita 1/3/5.

## Manifest, demanda e validação de recursos

`assets/manifest.js` lista marca/ícones e os dois recursos críticos do menu.
O boot inicia só esses; consulta de `media.*`/`icon(name)` inicia cada outro
recurso uma vez. APIs explícitas aceitam `keys` e `retry`; `whenSettled` pode
esperar só o subconjunto solicitado. Falhas resolvem a promessa, ficam no
fallback e não geram um loop de novas tentativas. Callback de decode antigo
não pode reverter falha ou interferir numa tentativa nova. Diagnósticos do
cache registram duração até ready/error (incluindo decode), por recurso e
tentativa, com clock monotônico quando disponível.

`scripts/validate-assets.py` verifica XML/namespace/dimensões SVG e estrutura,
CRC e stream comprimido PNG, incluindo imagens não referenciadas no manifest.
Usa apenas a biblioteca padrão do Python 3 e roda no CI. O medidor HTTP local
faz cinco lotes de requisições simultâneas por política; ele mede transferência
local e não pode provar melhoria de FPS, decode ou rede real. Veja
`COBERTURA-REFATORACAO.md` para critérios e pendências explícitas.

`boot()` é idempotente por canvas: uma segunda chamada devolve a instância
ativa sem abrir outro loop/listeners/áudio. Após dispose, um novo boot cria
uma instância nova. O cache de imagens permanece compartilhado e reutilizável.
A caixa de saque usa a pegada circular de `PHYS.BALL_RADIUS`, compartilhada
por `SERVE.BOX_TOLERANCE_M` na regra e na previsão; o HUD usa
`TURBO.MAX`/`THRESHOLD`, os mesmos parâmetros da mecânica.
