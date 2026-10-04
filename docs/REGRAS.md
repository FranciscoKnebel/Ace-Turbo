# Ace Turbo — Regras

Documento de referência do que o jogo implementa, em duas camadas:

1. **Regras de tênis** — oficiais, com as simplificações do protótipo marcadas.
2. **Mecânicas de jogo** — criação própria (tipos de batida, turbo, co-op etc.).

Para a parte técnica, veja [IMPLEMENTACAO.md](./IMPLEMENTACAO.md). Para jogar,
veja o [README](../README.md).

---

## 1. Partida

- Duração: **1 set** (padrão) ou **melhor de 3 sets** (tecla `S` no menu).
- Um **set** vai até **6 games** com 2 de diferença (6-0 … 6-4, 7-5). Em **6-6**
  joga-se um **tiebreak** (o set fecha 7-6).
- O **tiebreak** vai até **7 pontos** com 2 de diferença; o saque alterna
  **1-2-2-2…** (um ponto para o primeiro sacador, depois dois para cada).
- **Troca de lado**: no modo Versus, os jogadores mudam de metade da quadra a
  cada **game ímpar** e o placar acompanha o jogador. Em Co-op e Simples os
  lados são fixos.

## 2. Pontuação

| Pontos ganhos | Placar exibido |
| --- | --- |
| 0 | `0` |
| 1 | `15` |
| 2 | `30` |
| 3 | `40` |
| 3-3 | `DEUCE` (40-40) |
| empate + 1 | `AD` (vantagem) |

- **Game**: 4 pontos com 2 de diferença (ou 2 pontos seguidos após o AD).
- Após o game, os pontos zeram e o **saque alterna** para o outro time.

## 3. Saque

- **Quem saca**: alterna entre os times a cada game; em **duplas**, alterna
  também entre os dois jogadores do time (rodízio interno).
- **Lado (deuce/ad)**: pela **paridade do total de pontos do game** — par saca do
  lado direito (deuce), ímpar do lado esquerdo (ad), no referencial do sacador.
- **Caixa válida**: a bola precisa cair na **caixa de serviço diagonal** (lado
  oposto ao do sacador), entre a rede e a linha de saque.
- **1º e 2º saque**: uma falta dá a segunda tentativa; duas faltas = **dupla
  falta** (ponto do recebedor).
- **Let**: saque que toca a rede e cai na caixa correta é **repetido** (mesma
  tentativa). Se tocar a rede e cair fora, é falta normal.
- **Devolução**: o recebedor pode devolver **antes do quique** (voleio) — o
  ponto continua e não é ace.
- **Posições**: o sacador fica atrás da linha de fundo; o recebedor espera
  **perto da linha de fundo**; em duplas o parceiro do sacador e o parceiro do
  recebedor ficam próximos da rede.
- **Lançamento (toss)**: ao soltar a tecla, a bola é **lançada para o alto** e
  batida ~0,42 s depois (tempo de preparação), na altura da cabeça.

### Tipos de saque (mesmas teclas das batidas)

| Tipo | Tecla (P1 / P2) | Comportamento |
| --- | --- | --- |
| **Flat** | `Espaço` / `Enter` | rápido e rasteiro (saque padrão) |
| **Top spin (kick)** | `Z` / `,` | quica **alto** e mais fundo; mais arriscado |
| **Slice** | `X` / `.` | mais lento, **baixo** e **aberto** (perto da lateral) |
| **Lob** | `C` / `/` | alto, lento e seguro (bom para o 2º saque) |

## 4. Rally

- A bola pode **quicar uma vez** em cada lado. No **segundo quique** do mesmo
  lado, o ponto é de quem bateu (vale mesmo se o segundo quique sair).
- **Bola fora** (quique fora das linhas) → ponto do adversário de quem bateu.
- **Bola na rede** que cai do lado de quem bateu → ponto do adversário. Se
  passar (net cord), o jogo continua.
- Bola que passa a **cerca** depois de um quique válido → ponto de quem bateu
  (o adversário não devolveu).
- **Turnos**: um time não pode bater duas vezes seguidas. Em duplas, qualquer
  jogador do time pode devolver a bola.
- **Rede**: os jogadores não podem cruzar a rede.
- **Sem "trombada"**: a bola não colide com os jogadores (simplificação).

## 5. Mecânicas de jogo

### Batidas (teclas)

Segure a tecla para **carregar** e solte perto da bola para **bater**. As teclas
de direção definem a **mira** (lado e profundidade).

| Batida | Tecla (P1 / P2) | Comportamento |
| --- | --- | --- |
| **Flat** | `Espaço` / `Enter` | segura: profundidade e quique normais, menos erro |
| **Top spin** | `Z` / `,` | mais **funda**, **quica mais alto** e é agressiva — **mais risco de sair** |
| **Slice** | `X` / `.` | mais **lenta** e com **quique baixo** |
| **Lob** | `C` / `/` | **aérea**, alta e profunda |

### Forehand e backhand

A mão é definida pelo **lado do corpo em relação à bola** (jogadores destros):

- bola do lado dominante → **FOREHAND** (um pouco mais rápida e precisa);
- bola do outro lado → **BACKHAND** (um pouco mais lenta e com mais erro);
- bola em frente ao corpo → neutro.

O último golpe e a mão aparecem na tela (ex.: `TOPSPIN • FOREHAND`).

### Turbo

- Carga **≥ 75%** com reserva **≥ 30** vira um **golpe turbo** (mais rápido).
- A reserva regenera com o tempo (~4/s) e ganha bônus ao vencer o ponto.
- Só o flat e o top spin podem turbinar (slice e lob são golpes de controle).

### Modos e controles

| Tecla | Modo | Descrição |
| --- | --- | --- |
| `1` | **Co-op Duplas** | P1 + P2 na mesma dupla (time A) contra 2 CPUs |
| `2` | Simples | 1 jogador vs CPU |
| `3` | Versus | P1 vs P2 no mesmo teclado, com troca de lado a cada game ímpar |
| `4` | Demo | CPU vs CPU |

| | Movimento | Flat | Top spin | Slice | Lob |
| --- | --- | --- | --- | --- | --- |
| **P1** | `W A S D` | `Espaço` | `Z` | `X` | `C` |
| **P2** | `← ↑ ↓ →` | `Enter` | `,` (ou `Numpad 1`) | `.` (ou `Numpad 2`) | `/` (ou `Numpad 3`) |

Teclas globais: `R` reinicia, `P`/`Esc` pausa, `M` volta ao menu.
No menu: `D` alterna dificuldade, `S` alterna 1 set / melhor de 3.

## 6. Simplificações do protótipo

- A bola não colide com os jogadores (não existe "trombada" nem atrapalhar o
  adversário).
- Não há spin lateral de verdade: slice/topspin mudam velocidade, altura do
  quique e trajetória, mas não a curvatura no ar.
- Não há vento, sol, desafio de vídeo, hawk-eye nem troca de lado entre sets
  fora do modo Versus.
- O primeiro sacador do set seguinte segue o rodízio contínuo de games.
- A troca de lado do Versus troca o placar junto com os jogadores (o placar é do
  jogador, não da metade da quadra).
