# Ace Turbo: Plano de Implementação

> **Status: implementado e validado.** A simulação, a IA, o cliente web e a
> suíte de testes estão prontos (veja o README para jogar). Partidas CPU vs CPU
> completas terminam com placar válido, e há testes de regras, física,
> integração e do boot do cliente.

Protótipo jogável de tênis com regras reais (pontuação, games, sets, tiebreak,
saque com 1º/2º serviço, fault, let), visão em perspectiva 3D e **co-op** (dois
jogadores no mesmo teclado na mesma dupla contra duas CPUs).

## 1. Objetivo

Entregar um jogo de tênis funcional, testado e jogável no navegador, com:

- partida completa de tênis (melhor de 3 sets) com regras oficiais simplificadas;
- modo **co-op de duplas** (P1 + P2 vs 2 CPUs) como modo principal;
- modos extras: Simples (1P vs CPU), Versus Simples (P1 vs P2) e Demo (CPU vs CPU);
- simulação determinística e testável fora do navegador.

## 2. Decisões técnicas

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| Plataforma | HTML5 Canvas + JavaScript (ES modules) | roda em qualquer navegador, sem toolchain nem build |
| Dependências | zero em runtime; `node:test` para testes | sem instalação, funciona offline |
| Simulação | determinística, timestep fixo de 120 Hz, RNG com seed | reproduzível em testes (CPU vs CPU) |
| Bola | 3D (x, y na quadra + z altura) | permite rede, lob, altura de golpe e regras reais de quique |
| Câmera | perspectiva 3D atrás do time A, quadra inteira visível | profundidade e altura reais; dois jogadores na mesma tela |
| Idioma | UI em pt-BR | público do projeto |

## 3. Modos de jogo

1. **Co-op Duplas (principal)**: P1 + P2 no time A contra 2 CPUs, quadra de
   duplas, rodízio de saque entre os parceiros do mesmo time. ← requisito "co-op"
2. **Simples**: 1 jogador vs CPU, quadra de simples.
3. **Versus Simples**: P1 vs P2 no mesmo teclado.
4. **Demo**: duplas CPU vs CPU (útil para assistir e para os testes de integração).

Dificuldade (Fácil / Normal / Difícil) ajusta velocidade, precisão e reação da IA.

## 4. Regras implementadas

- **Pontuação**: 0 / 15 / 30 / 40; 40-40 vira **DEUCE**; vantagem (**AD**);
  game exige 2 pontos de diferença.
- **Set**: primeiro a 6 games com 2 de diferença; **6-6 → tiebreak** (7 pontos,
  2 de diferença, saque alternando 1-2-2-2...). **Partida**: melhor de 3 sets.
- **Saque**: alterna games entre os times; em duplas alterna o sacador dentro do
  time; lado deuce/ad definido pela paridade dos pontos do game; a bola precisa
  cair na caixa de serviço **diagonal**.
- **1º e 2º saque**: falta → 2ª tentativa; duas faltas → **dupla falta**
  (ponto do recebedor).
- **Let**: saque que toca a rede e cai na caixa correta é repetido (mesma tentativa).
- **Rally**: bola na rede que cai do lado de quem bateu → ponto do adversário;
  se passa, o jogo segue. Bola fora → ponto do adversário. Dois quiques do mesmo
  lado → ponto do outro. Bola na cerca → ponto (quem errou perde, quem forçou ganha).
- **Turnos**: um time não pode bater duas vezes seguidas; qualquer jogador do
  time pode devolver; rebater o saque antes do quique é permitido.

Simplificações de protótipo (documentadas): a bola não colide com os jogadores,
não há troca de lado entre sets, e o primeiro sacador do set seguinte segue o
rodízio contínuo de games.

## 5. Física e controles

- Quadra oficial: 23,77 m × 8,23 m (simples) / 10,97 m (duplas); linha de saque a
  6,40 m; rede de 0,914 m (centro) a 1,07 m (postes).
- **Golpes balísticos**: alvo + tempo de voo determinam a velocidade inicial, o
  que permite mirar (teclas de direção no momento do golpe) e carregar potência.
- **Controles**: P1: WASD move, **Space** carrega/solta para bater ou sacar.
  P2: setas + **Enter**. "Para trás" com carga baixa = **lob**.
- **Turbo**: carga ≥ 75% com reserva ≥ 30 vira golpe turbo (voo mais rápido);
  a reserva regenera com o tempo e ganha bônus ao vencer o ponto.
- **Teclas globais**: `R` reinicia, `P`/`Esc` pausa, `M` volta ao menu.

## 6. Arquitetura

```
├── index.html            # página + canvas + CSS
├── scripts/serve.js      # servidor estático mínimo (sem dependências)
├── src/
│   ├── main.js           # bootstrap, loop de 120 Hz, menu/pausa, áudio
│   ├── input.js          # teclado → comandos por jogador
│   ├── render.js         # desenho da quadra, jogadores, bola e HUD
│   └── sim/              # simulação pura (roda no Node para testes)
│       ├── constants.js  # dimensões oficiais e constantes de gameplay
│       ├── math.js       # utilidades + solução balística
│       ├── rng.js        # PRNG com seed (mulberry32)
│       ├── physics.js    # integração da bola, rede, quiques, limites
│       ├── score.js      # placar oficial (pontos, games, sets, tiebreak)
│       ├── ai.js         # previsão de trajetória e controle das CPUs
│       └── world.js      # orquestra física + regras + fases da partida
└── tests/                # node:test (score, física, regras, integração, render)
```

A simulação não conhece DOM: o cliente web apenas envia comandos e desenha o
estado. Isso permite partidas CPU vs CPU headless nos testes.

## 7. IA

- Prevê a trajetória com a mesma física, corre para o ponto de interceptação,
  temporiza a carga e devolve; mira na quadra aberta; em duplas, um cobre e o
  outro fecha o lado oposto.
- Dificuldades ajustam velocidade máxima, erro de mira/timing e tempo de reação.

## 8. Testes e validação

- `node:test` cobrindo: pontuação (deuce, AD, game, set, tiebreak, partida),
  saque (lado, caixa, fault, let, dupla falta), física (balística, quique, rede,
  fora), regras de rally (dois quiques, fora, própria quadra), turnos, rodízio de
  saque em duplas, partida completa CPU vs CPU e smoke test do render com canvas falso.
- **Critério de pronto**: suíte verde + partida CPU vs CPU completa com placar
  válido + jogo jogável no navegador.

## 9. Milestones (commits)

1. `docs:` plano de implementação
2. `feat:` simulação (constantes, física, placar) + testes
3. `feat:` IA, orquestrador da partida e testes de integração
4. `feat:` cliente web (canvas, input, HUD, menu)
5. `test:` validação completa e correções
6. `docs:` README com instruções

## 10. Fora do escopo do protótipo

Rede online, assets audiovisuais elaborados, seleção de personagens, efeitos de
spin/vento, replay/desafio, troca de lado e narração.

## 11. Revisões após playtest

Feedback: "muito rápido, muito difícil, faltam elementos 3D, direcional invertido".

- **3D**: o render passou a usar uma câmera em perspectiva (projeção pinhole):
  a quadra vira um trapézio, a rede tem altura real, jogadores são desenhados em
  pé e a bola mostra a altura com sombra no chão.
- **Direcional**: as direções agora são relativas à tela para os dois jogadores
  (cima = fundo adversário, direita = direita da tela), sem espelhamento; a mira
  lateral do saque foi corrigida para acompanhar a tela.
- **Ritmo**: gravidade menor, bolas mais lentas, jogadores mais lentos, janela
  de golpe maior e alcance maior.
- **Dificuldade**: IA com menos velocidade/precisão nos três níveis, Fácil como
  padrão, e partida padrão de **1 set** (tecla `S` alterna para melhor de 3).

## 12. Revisões após o segundo playtest

Feedback: troca de lado no versus, raquete sempre visível encostando na bola e
tipos de batida (top spin, slice e lob).

- **Troca de lado**: no modo Versus os jogadores trocam de metade da quadra a
  cada game ímpar; o placar acompanha o jogador (os valores de pontos/games/sets
  são espelhados junto com os times) e o saque segue a rotação correta.
- **Raquete**: fica sempre visível, aponta para a bola (inclusive na altura
  dela), varre no golpe e o impacto gera um efeito de contato no ponto da bola.
- **Tipos de batida**: direção para trás + carga baixa = **lob** (aérea); direção
  para trás + carga alta = **slice** (mais lenta e com quique baixo, via
  `bounceScale`); caso contrário = **top spin**. A IA escolhe os três tipos e a
  etiqueta do último golpe aparece na tela.

## 13. Revisões após o terceiro playtest

Feedback: tipos de batida em teclas dedicadas (flat no Espaço), top spin mais
fundo/alto/arriscado e o conceito de forehand/backhand.

- **Teclas de batida**: P1 = `Espaço` (flat), `Z` (top spin), `X` (slice),
  `C` (lob); P2 = `Enter` (flat), `,` (top spin), `.` (slice), `/` (lob), com
  aliases `Numpad 1/2/3`. O tipo é memorizado durante a carga, porque a tecla já
  está solta no frame do golpe.
- **Top spin**: alvo mais fundo, quique mais alto (`bounceScale` 1.3) e erro
  maior (mais risco de ir para fora). A flat virou a batida segura; slice segue
  lenta e baixa; lob segue aérea.
- **Forehand/backhand**: definidos pelo lado do corpo em relação à bola
  (jogadores destros): forehand um pouco mais rápido e preciso; backhand mais
  lento e instável. Aparecem no HUD junto do tipo de batida e nas estatísticas
  (`stats.hands`).

## 14. Revisões após o quarto playtest

Feedback: a IA avançava demais para a rede (gerando erros não forçados) e o
segundo saque saía da posição onde o sacador estava, não da posição de saque.

- **Posicionamento da IA**: ela calculava interceptação mesmo quando a bola era
  do próprio time (ainda em voo), o que a puxava para a rede. Agora só se
  posiciona quando é a vez do time (`myTurn`), prefere bater **depois do
  quique** e recupera para o fundo entre os golpes. A mira da IA também foi
  separada do movimento (`input.aim`), então ela não "anda para a frente" ao
  carregar um top spin. Medições: tempo perto da rede caiu de ~22% para ~1% e a
  profundidade média subiu de ~6,8 m para ~9,2 m.
- **2º saque**: ao acontecer uma falta (ou let), o sacador volta para a posição
  oficial de saque (`serveSpot`), mesmo que estivesse se movendo durante o saque
  anterior; a bola volta para a mão dele.
- **Equilíbrio**: com a IA mais recuada, o erro de execução foi recalibrado
  (top spin continua mais arriscado) para manter rallies de ~3 a ~9 rebatidas e
  pontos decididos por erros forçados e bolas vencedoras.

## 15. Revisões após o quinto playtest

Feedback: o saque precisava variar com os botões (seguindo a lógica das
batidas), a recepção devia ser mais funda e o saque devia ter preparação (bola
ao alto e depois a batida).

- **Tipos de saque**: as mesmas 4 teclas escolhem o saque — flat (rápido),
  top spin/kick (alto e fundo, mais arriscado), slice (lento, baixo e aberto) e
  lob (alto e seguro, bom para o 2º saque). Cada tipo tem velocidade, arco,
  alvo, erro e `bounceScale` próprios; a IA varia os tipos (1º saque agressivo,
  2º mais seguro) e as estatísticas ficam em `stats.serveTypes`.
- **Lançamento (toss)**: ao soltar a tecla, o sacador joga a bola para o alto
  (`SERVE.TOSS_VZ`) e, após `SERVE.TOSS_TIME` (~0,42 s), a raquete bate na bola
  no alto — dando tempo de preparação e uma leitura clara do saque. Durante o
  lançamento o sacador fica parado e não acumula nova carga.
- **Recepção mais funda**: o recebedor agora espera a ~0,6 m da linha de fundo
  (antes ficava ~2,6 m dentro da quadra), como no tênis de verdade.
