# Ace Turbo

Protótipo jogável de tênis no navegador, com regras oficiais (pontuação
0/15/30/40, deuce, vantagem, games, sets, tiebreak, 1º/2º saque, fault e let),
visão top-down e **co-op de duplas** (dois jogadores no mesmo teclado contra
duas CPUs).

O plano completo de implementação está em [PLAN.md](./PLAN.md).

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
npm test             # node:test: 48 testes de regras, física, IA e cliente
```

## Modos de jogo

| Tecla | Modo | Descrição |
| --- | --- | --- |
| `1` | **Co-op Duplas** | P1 + P2 na mesma dupla (time A) contra 2 CPUs: modo principal |
| `2` | Simples | 1 jogador vs CPU |
| `3` | Versus | P1 vs P2 no mesmo teclado |
| `4` | Demo | CPU vs CPU (assistir / validar a IA) |

A dificuldade (Fácil / Normal / Difícil) muda velocidade, precisão e tempo de
reação das CPUs (`D` no menu).

## Controles

| | Movimento | Golpe / Saque |
| --- | --- | --- |
| **P1** | `W A S D` | `Espaço` (segure e solte) |
| **P2** | `← ↑ ↓ →` | `Enter` (segure e solte) |

- **Segure** para carregar a força e **solte** no tempo da bola.
- As teclas de direção também definem a **mira** do golpe. Pressionar "para
  trás" com carga baixa executa um **lob**.
- Carga ≥ 75% com reserva de turbo ≥ 30 vira um **golpe turbo** (mais rápido);
  a reserva regenera com o tempo e ganha bônus ao vencer o ponto.
- No saque, a direção escolhe profundidade/lado dentro da caixa válida e a
  carga controla velocidade e precisão.

Teclas globais: `R` reinicia, `P`/`Esc` pausa, `M` volta ao menu.

## Regras implementadas

- **Pontos**: 0 / 15 / 30 / 40; 40-40 = **DEUCE**; vantagem (**AD**); game com
  2 pontos de diferença.
- **Sets**: primeiro a 6 games com 2 de diferença; **6-6 = tiebreak** (7 pontos,
  2 de diferença, saque alternando 1-2-2-2...). Partida em **melhor de 3 sets**.
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

Simplificações documentadas do protótipo: a bola não colide com os jogadores
(não existe "trombada"), não há troca de lado entre sets e o primeiro sacador do
set seguinte segue o rodízio contínuo de games.

## Arquitetura

```
├── index.html            # canvas + CSS
├── scripts/serve.js      # servidor estático mínimo (sem dependências)
├── src/
│   ├── main.js           # boot, loop fixo de 120 Hz, menu, pausa, áudio
│   ├── input.js          # teclado → comandos por jogador
│   ├── render.js         # quadra, jogadores, bola, HUD, menu e overlays
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

A simulação é determinística (timestep fixo + RNG com seed) e independente do
DOM: o cliente apenas envia comandos e desenha o estado. É isso que permite
rodar partidas CPU vs CPU completas dentro dos testes.

## Testes

- **Placar** (`tests/score.test.js`): game, deuce/ad, set 6-0 e 7-5, tiebreak,
  rotação de saque no tiebreak, lado do saque por paridade, melhor de 3.
- **Física** (`tests/physics.test.js`): balística com arrasto, perda de energia
  no quique, colisão com a rede (inclusive raspão da fita que vira let), bola
  alta, limites da quadra, cerca.
- **Regras** (`tests/world.test.js`): formação do saque, saque válido, fault,
  dupla falta, let, quique no próprio lado, dois quiques, bola fora, turnos,
  rodízio de saque em duplas, ace, reinício de ponto, limite da rede.
- **Integração** (`tests/integration.test.js`): partidas completas CPU vs CPU em
  várias sementes/dificuldades, com placar válido e rallies reais.
- **Humano roteirizado** (`tests/human.test.js`): um jogador sintético usa o
  mesmo caminho de input do cliente (saque, movimentação, golpes) até o fim da
  partida.
- **Cliente** (`tests/render.test.js`, `tests/client.test.js`): HUD, menu,
  overlays e boot completo com DOM simulado, incluindo iniciar partida, pausar
  e voltar ao menu.

## Limitações e próximos passos

Fora do escopo deste protótipo: multiplayer em rede, efeitos de spin/vento,
seleção de personagens, replay/desafio, troca de lado e narração. A IA não tem
"personalidade" por jogador: as três dificuldades compartilham o mesmo
comportamento com parâmetros diferentes.
