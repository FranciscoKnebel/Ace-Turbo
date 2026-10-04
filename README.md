# Ace Turbo

Protótipo jogável de tênis no navegador, com regras oficiais (pontuação
0/15/30/40, deuce, vantagem, games, sets, tiebreak, 1º/2º saque, fault e let),
**visão em perspectiva 3D** e **co-op de duplas** (dois jogadores no mesmo
teclado contra duas CPUs).

O plano completo de implementação está em [PLAN.md](./PLAN.md). A documentação
detalhada fica em [docs/REGRAS.md](./docs/REGRAS.md) (regras do tênis e mecânicas
do jogo) e [docs/IMPLEMENTACAO.md](./docs/IMPLEMENTACAO.md) (arquitetura, física,
IA, render e testes). As imagens de marca (logo, logo curto e a cena do menu)
ficam em `assets/media/` e são carregadas por `src/media.js`, com fallback
procedural enquanto não terminam de carregar. Todos os textos ficam em
`src/lang/pt.js` e `src/lang/en.js` (sistema em `src/i18n.js`), com troca de
idioma no menu.

## Como rodar

Não há dependências nem build. Basta servir os arquivos:

```bash
npm run serve        # http://localhost:5173
```

Qualquer servidor estático funciona (por exemplo `python3 -m http.server`).
Abrir `index.html` direto no navegador também funciona, porque o jogo usa
apenas módulos ES nativos.

## Como testar

```bash
npm test             # node:test: 117 testes de regras, física, IA, batidas, saque, vigor, i18n, ícones e cliente
```

## Modos de jogo

| Tecla | Modo | Descrição |
| --- | --- | --- |
| `1` | **Co-op Duplas** | P1 + P2 na mesma dupla (time A) contra 2 CPUs: modo principal |
| `2` | Simples | 1 jogador vs CPU |
| `3` | Versus | P1 vs P2 no mesmo teclado, com **troca de lado a cada game ímpar** |
| `4` | Demo | CPU vs CPU (assistir / validar a IA) |

Ajustes no menu: `↑`/`↓` escolhe a opção, `1` a `7` são atalhos para cada item,
`Q`/`E` alteram **Dificuldade** e **Partida** (nos modos, use `←`/`→` ou o
número) e `Enter` confirma. Há também a opção **Como jogar**, com controles,
batidas, saque e regras. Dificuldade: Fácil / Normal / Difícil / Injusto /
Impossível (Fácil por padrão). Partida: **1 set** por padrão ou melhor de 3.
Idioma: **Português** ou **English**, com detecção pelo idioma do navegador.

## Controles

| | Movimento | Correr | Flat | Top spin | Slice | Lob |
| --- | --- | --- | --- | --- | --- | --- |
| **P1** | `W A S D` | `Shift esquerdo` | `Espaço` | `J` | `K` | `L` |
| **P2** | `← ↑ ↓ →` | `Shift direito` (ou `Numpad 0`) | `Enter` | `,` (ou `Numpad 1`) | `.` (ou `Numpad 2`) | `/` (ou `Numpad 3`) |

Segure **Shift** enquanto se move para **correr** (gasta a barra de vigor).
Cada tecla de batida é usada como o `Espaço`: **segure para carregar e solte**
perto da bola, e **carregar também gasta vigor**. A barra só recarrega durante
o rally (pausa no saque e no fim de ponto) e, abaixo de 25, o jogador fica
**cansado**: anda e carrega mais devagar, então golpes saem mais fracos. As
teclas de direção definem a **mira** (lado e profundidade); no saque escolhem o
alvo dentro da caixa válida.

As direções são **relativas à tela** (a câmera fica atrás do time A): `cima` vai
para o fundo da quadra adversária e `direita` para a direita da tela: para os
dois jogadores, sem inversão.

- A raquete fica sempre visível, acompanha a bola (inclusive a altura dela) e
  toca na bola no momento do golpe.
- As ações aparecem como **ícones** (`assets/icons/`): o golpe/saque na tela e
  a mão no selo do ícone, **+** para forehand e **-** para backhand (neutro sem
  selo); vigor e tiebreak também têm ícones.
- Carga ≥ 75% com reserva de turbo ≥ 30 vira um **golpe turbo** (mais rápido);
  a reserva regenera com o tempo e ganha bônus ao vencer o ponto.

### Tipos de batida

| Batida | Tecla | Comportamento |
| --- | --- | --- |
| **Flat** | `Espaço` / `Enter` | batida segura: profundidade normal, quique normal, menos erro |
| **Top spin** | `J` / `,` | mais **funda** (perto da linha de fundo), **quica mais alto** e é mais agressiva: **mais risco de ir para fora** |
| **Slice** | `K` / `.` | bola **mais lenta**, **quique baixo** e **curva lateral** |
| **Lob** | `L` / `/` | bola **aérea**, alta e profunda |

### Saque

O saque usa **as mesmas teclas**, com efeitos próprios:

- **Flat**: rápido e rasteiro (o saque padrão).
- **Top spin (kick)**: quica alto e fundo, com mais risco.
- **Slice**: mais lento, baixo e aberto (perto da lateral).
- **Lob**: alto, lento e seguro (bom para o 2º saque).

Ao soltar a tecla, o sacador **lança a bola bem alto** (a batida acontece por
volta de 2,5 m) e, depois de um curto tempo de preparação (~0,5 s), a raquete
**bate na bola no alto**: o saque não é instantâneo. Durante o saque, a **mira
aparece desenhada na quadra** e as teclas de direção controlam onde a bola vai
cair: esquerda/direita perto das laterais ou do centro, e para frente/trás
curta (perto da rede) ou funda (perto da linha de saque). O recebedor espera
**fundo, perto da linha de fundo**.

### Forehand e backhand

A mão depende do **lado do corpo** em relação à bola (jogadores destros):

- bola do lado dominante → **FOREHAND**: um pouco mais rápida e precisa;
- bola do outro lado → **BACKHAND**: um pouco mais lenta e com mais erro;
- bola em frente ao corpo → neutro.

O tipo da última batida e a mão aparecem na tela (ex.: `TOPSPIN • FOREHAND`).

### Golpes fundamentais

- **Forehand / Backhand**: golpe do lado dominante / lado oposto do corpo.
- **Voleio**: golpe curto e firme antes do quique, perto da rede.
- **Smash**: golpe acima da cabeça, resposta a um lob alto.
- **Meio-voleio**: golpe defensivo logo após o quique, quase no chão.
- **Saque** e **Devolução**: início do ponto e primeiro golpe de quem recebe
  (em duplas, a devolução é sempre do recebedor designado).

A situação do golpe é detectada automaticamente e ajusta a física (voleio mais
curto e firme, smash mais potente, meio-voleio mais alto e seguro).

### Troca de lado (Versus)

No modo **Versus** (P1 vs P2 no mesmo teclado), os jogadores **trocam de lado a
cada game ímpar**, como no tênis, e o placar acompanha o jogador: o saque e a
recepção ficam alternados de forma justa.

Teclas globais: `R` reinicia, `P`/`Esc` pausa, `M` volta ao menu.

## Regras implementadas

- **Pontos**: 0 / 15 / 30 / 40; 40-40 = **DEUCE**; vantagem (**AD**); game com
  2 pontos de diferença.
- **Sets**: primeiro a 6 games com 2 de diferença; **6-6 = tiebreak** (7 pontos,
  2 de diferença, saque alternando 1-2-2-2...). Partida de **1 set** por padrão
  (`S` no menu alterna para melhor de 3).
- **Saque**: alterna games entre os times; em duplas alterna o sacador dentro do
  time; lado deuce/ad pela paridade dos pontos; a bola tem de cair na **caixa de
  serviço diagonal**.
- **Faltas**: 1º e 2º saque; duas faltas = **dupla falta** (ponto do recebedor).
- **Let**: saque que toca a rede e cai na caixa correta é repetido (mesma tentativa).
- **Rally**: bola na rede que cai do lado de quem bateu = ponto do adversário;
  se passa, o jogo continua. Bola fora = ponto do adversário. Dois quiques do
  mesmo lado = ponto de quem bateu (o segundo quique vale mesmo se a bola sair).
- **Turnos**: um time não pode bater duas vezes seguidas; qualquer jogador da
  dupla pode devolver; rebater o saque antes do quique é permitido.

Simplificações documentadas do protótipo: a bola toca os jogadores apenas pela
regra de colisão (parceiro perde o ponto se for atingido antes da bola cruzar;
adversário perde se for atingido depois do quique), o primeiro sacador do set
seguinte segue o rodízio contínuo de games e a troca de lado acontece no modo
Versus a cada game ímpar.

## Arquitetura

```
├── index.html            # canvas + CSS
├── scripts/serve.js      # servidor estático mínimo (sem dependências)
├── src/
│   ├── main.js           # boot, loop fixo de 120 Hz, menu, pausa, áudio
│   ├── input.js          # teclado → comandos por jogador
│   ├── render.js         # câmera em perspectiva 3D, quadra, jogadores, bola, HUD
│   ├── audio.js          # efeitos com WebAudio (sem assets)
│   └── sim/              # simulação pura (também roda no Node)
│       ├── constants.js  # dimensões oficiais e constantes de gameplay
│       ├── math.js       # balística com arrasto + folga sobre a rede
│       ├── rng.js        # PRNG determinístico (mulberry32)
│       ├── physics.js    # integração da bola, rede, quiques, cerca
│       ├── score.js      # placar oficial (pontos, games, sets, tiebreak)
│       ├── ai.js         # previsão de trajetória e controle das CPUs
│       └── world.js      # orquestra física + regras + fases da partida
└── tests/                # node:test
```

A bola é simulada em **três dimensões** (x, y na quadra + altura z). O cliente
projeta esse mundo com uma câmera em perspectiva: a quadra vira um trapézio, a
rede tem altura real, os jogadores são desenhados em pé e a bola mostra a
altura (com sombra no chão). A simulação continua determinística e independente
do DOM, o que permite rodar partidas CPU vs CPU completas nos testes.

## Testes

- **Placar** (`tests/score.test.js`): game, deuce/ad, set 6-0 e 7-5, tiebreak,
  rotação de saque no tiebreak, lado do saque por paridade, melhor de 3.
- **Física** (`tests/physics.test.js`): balística com arrasto, perda de energia
  no quique, colisão com a rede (inclusive raspão da fita que vira let), bola
  alta, limites da quadra, cerca.
- **Regras** (`tests/world.test.js`): formação do saque, saque válido, fault,
  dupla falta, let, quique no próprio lado, dois quiques, bola fora, turnos,
  rodízio de saque em duplas, ace, reinício de ponto, limite da rede.
- **Batidas** (`tests/shots.test.js`): flat, top spin (mais fundo, quique alto e
  mais bolas fora), slice (mais lenta, quique baixo) e lob (aérea), além de
  forehand/backhand e das estatísticas por tipo.
- **Saque** (`tests/serve.test.js`): lançamento (toss) com batida no alto,
  recepção funda, tipos de saque (flat/kick/slice/lob) e estatísticas.
- **Troca de lado** (`tests/versus-ends.test.js`): versus troca a cada game ímpar
  com o placar seguindo o jogador; coop/simples não trocam.
- **Controles** (`tests/controls.test.js`): direções relativas à tela para P1 e
  P2 (sem inversão) e mira do golpe/saque.
- **Integração** (`tests/integration.test.js`): partidas completas CPU vs CPU em
  várias sementes/dificuldades (1 set e melhor de 3), com placar válido e rallies reais.
- **Humano roteirizado** (`tests/human.test.js`): um jogador sintético usa o
  mesmo caminho de input do cliente (saque, movimentação, golpes) até o fim da
  partida.
- **Cliente** (`tests/render.test.js`, `tests/client.test.js`): câmera em
  perspectiva (enquadramento e profundidade), HUD, menu, overlays e boot
  completo com DOM simulado, incluindo iniciar partida, pausar e voltar ao menu.

## Ritmo e dificuldade

O jogo foi calibrado para ser mais lento e acessível: bolas com tempo de voo
maior, jogadores mais lentos, janela de golpe mais generosa e alcance maior. A
IA tem cinco níveis (Fácil, Normal, Difícil, **Injusto** e **Impossível**, com
Fácil por padrão) e a partida padrão é de **1 set**. A velocidade da IA é justa:
72% da humana no Fácil, 86% no Normal, 100% no Difícil, 110% no **Injusto** e
125% no **Impossível** (os dois acima do Difícil). A IA também usa o vigor
(corre quando precisa), com barra menor e recarga mais lenta. Em partidas de CPU vs CPU, uma partida de 1 set leva cerca de 17 a 28
minutos simulados, com rallies de ~6 a ~11 rebatidas por ponto conforme a
dificuldade (jogadores humanos tendem a decidir os pontos mais rápido). A IA
joga de fundo: prefere bater depois do quique e só avança quando a bola é curta.

## Limitações e próximos passos

Fora do escopo deste protótipo: multiplayer em rede, efeitos de spin lateral e
vento, seleção de personagens, replay/desafio e narração. A IA não tem
"personalidade" por jogador: as três dificuldades compartilham o mesmo
comportamento com parâmetros diferentes. A lista completa de simplificações
está em [docs/REGRAS.md](./docs/REGRAS.md#6-simplificações-do-protótipo).
