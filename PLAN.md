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

- **Tipos de saque**: as mesmas 4 teclas escolhem o saque: flat (rápido),
  top spin/kick (alto e fundo, mais arriscado), slice (lento, baixo e aberto) e
  lob (alto e seguro, bom para o 2º saque). Cada tipo tem velocidade, arco,
  alvo, erro e `bounceScale` próprios; a IA varia os tipos (1º saque agressivo,
  2º mais seguro) e as estatísticas ficam em `stats.serveTypes`.
- **Lançamento (toss)**: ao soltar a tecla, o sacador joga a bola para o alto
  (`SERVE.TOSS_VZ`) e, após `SERVE.TOSS_TIME` (~0,42 s), a raquete bate na bola
  no alto: dando tempo de preparação e uma leitura clara do saque. Durante o
  lançamento o sacador fica parado e não acumula nova carga.
- **Recepção mais funda**: o recebedor agora espera a ~0,6 m da linha de fundo
  (antes ficava ~2,6 m dentro da quadra), como no tênis de verdade.

## 16. Revisões após o sexto playtest

Feedback: teclas de batida do P1 difíceis de alcançar com WASD, falta de uma
tela "Como jogar" e conflito das teclas D/S no menu.

- **Teclas do P1**: top spin, slice e lob passam de `Z`/`X`/`C` para
  **`J`/`K`/`L`** (a flat continua no `Espaço`), ficando do lado direito do
  teclado, perto da mão que já usa o Espaço.
- **Menu com foco**: `↑`/`↓` escolhe a opção, **`Q`/`E` altera o valor** (modo,
  dificuldade, duração) e `Enter` confirma; `D` e `S` deixaram de ser usadas no
  menu (são teclas de movimento do P1). Atalhos `1` a `4` continuam escolhendo o
  modo.
- **Tela "Como jogar"**: nova opção no menu que abre uma tela com controles,
  tipos de batida, saque, pontuação, regras do rally e extras.

## 17. Revisões após o sétimo playtest

Feedback: toss do saque mais alto, mais controle de direção no saque e quiques
mais altos em geral.

- **Toss mais alto**: `SERVE.TOSS_VZ` de 4,2 para 5,8 m/s e `TOSS_TIME` de 0,42
  para 0,52 s; a batida acontece por volta de 2,5 m de altura, com a raquete
  acompanhando o novo alcance.
- **Controle de direção no saque**: o alvo passou a cobrir a caixa inteira
  (lateral de 0,15 a 4,0 m; profundidade de 0,3 a 6,1 m, ajustadas por tipo) e
  `serveAimTarget` virou a fonte única do alvo, usada também pela **mira
  desenhada na quadra** durante o saque. A IA usa mira conservadora (valores
  fracionários via `input.aim`) para não estourar as faltas.
- **Quiques mais altos**: `BOUNCE_RESTITUTION` de 0,62 para 0,7 (top spin e kick
  quicam ainda mais alto, slice continua baixo). O "saque errado" agora mira a
  fita de propósito (`timeForNetHit`) e a bola raspada dribla curta, mantendo
  lets e net cords no jogo.

## 18. Revisões após o oitavo playtest

Feedback: indicador Q/E só em dificuldade/partida, numérico nos demais itens,
pausa maior sem travar a movimentação, IA de duplas muito colada, colisão entre
companheiros e colisão da bola nos jogadores, além de documentação clara.

- **Menu**: o indicador `Q ◀ ▶ E` aparece só em **Dificuldade** e **Partida**;
  os modos usam `←`/`→` ou o número; todos os itens têm atalho numérico (1 a 7).
- **Pausa**: 2,2 s por ponto e 3,4 s em game/set, com a **movimentação liberada**
  durante o anúncio (só os golpes ficam bloqueados) e a bola continuando a rolar.
- **Posicionamento da IA em duplas**: só o parceiro mais perto persegue a bola,
  cada um cobre a sua metade e quem não vai jogar uma bola que sairá sai da
  frente dela. A distância média entre parceiros subiu para ~5,7 m (mínima
  ~2,4 m) nos testes.
- **Colisões**: companheiros não ocupam o mesmo espaço (`resolvePlayerCollisions`)
  e a bola que toca um jogador encerra o ponto conforme a regra
  (`checkPlayerBallCollision`): parceiro antes de cruzar/quicar perde na hora;
  adversário só conta depois do quique.
- **Documentação**: `docs/REGRAS.md` ganhou a seção de colisões, a pausa e uma
  tabela de **testes por regra**; `docs/IMPLEMENTACAO.md` descreve as colisões, a
  coordenação da IA e as teclas do menu.

## 19. Revisões após o nono playtest

Feedback: devolução em duplas sempre do recebedor, saques mais fortes, IA mais
justa (velocidade), vigor/stamina com Shift e os golpes fundamentais do tênis.

- **Devolução em duplas**: o saque só pode ser devolvido pelo **recebedor
  designado** (o jogador do lado que recebeu o saque); o parceiro da rede não
  pode roubar a devolução (`serve.receiverId`).
- **Saques mais fortes**: o voo base subiu para `lerp(14, 24, charge)` e cada
  tipo divide o voo pelo seu fator (flat 1, kick 0,92, slice 0,78, lob 0,6),
  então o flat chega a ~30 m/s com carga alta e o slice/lob continuam lentos.
- **IA mais justa**: velocidades de 72% (fácil), 86% (normal) e 100% (difícil)
  da velocidade humana, no lugar de 45/56/66%.
- **Vigor/stamina**: Shift corre (45% mais rápido), gastando uma barra que
  recarrega parado; esgotada, é preciso soltar o Shift. Barra desenhada sob os
  pés dos jogadores humanos.
- **Golpes fundamentais**: além dos tipos por tecla, cada golpe agora é
  classificado pela situação (devolução, voleio, smash, meio-voleio, fundo), com
  efeitos próprios e etiqueta na tela; tudo documentado em `docs/REGRAS.md`.

## 20. Revisões após o décimo playtest

Feedback: meio-voleios demais, revisão da devolução em duplas, efeito lateral no
slice, dificuldade Injusto, sprint/barra da IA e pausa da recarga no saque.

- **Meio-voleio**: o gatilho ficou estrito (bola a até 0,15 m de altura e menos
  de 0,07 s após o quique) e a IA voltou a bater perto do quique. Nas medições,
  caiu de ~4.400 para ~90 a ~360 ocorrências por 5 partidas, conforme a
  dificuldade.
- **Toque no corpo**: a regra não conta quando o jogador está **jogando a bola**
  (carga ou golpe ativo). Isso removeu os falsos positivos de timing (o toque no
  adversário caiu de ~51% para 0,1% dos pontos) e manteve a regra do parceiro.
- **Devolução em duplas**: `serve.returnPending` bloqueia o parceiro da rede
  **até a devolução acontecer** (antes o bloqueio acabava quando o saque quicava).
- **Efeito lateral do slice**: `ball.curve` aplica uma aceleração perpendicular
  ao movimento (3,2 m/s² nos golpes, 4,5 m/s² no saque), com o alvo
  pré-compensado e a previsão da IA considerando a curva.
- **Dificuldade Injusto**: acima do Difícil (velocidade 110% da humana, erro
  mínimo e reação de 0,05 s), disponível no menu.
- **Vigor da IA**: a IA usa o sprint quando precisa cobrir mais de 2,5 m, com
  barra menor e recarga a 60% da taxa humana; a recarga pausa durante o saque.
- **Ferramenta**: `npm run audit:docs` confere as regras documentadas contra o
  código e os testes (31 verificações).

## 21. Imagens de marca e dificuldade Impossível

- **Imagens**: `assets/media/` ganhou `logo.png`, `logo-short.png` e
  `landing.png`, carregadas por `src/media.js` (`loadMedia`, `drawCover` e
  `drawContain`). A landing virou o fundo do menu, o logo o título e o logo
  curto aparece no "Como jogar", na pausa, no fim de jogo e como marca discreta
  no canto da quadra, com fallback procedural enquanto carregam.
- **Dificuldade Impossível**: acima do Injusto (skill 0,99, 125% da velocidade
  humana e reação de 0,02 s). Nas medições de CPU vs CPU, cerca de 15,4
  rebatidas por ponto e ~29 min por partida de 1 set: a mais exigente do jogo.

## 22. Vigor de carga, recarga no fim de ponto e i18n

Feedback: segurar o botão de força deve gastar vigor, sem vigor as ações devem
ser mais punitivas, a recarga deve pausar no fim de ponto e o jogo deve ter
i18n (português e inglês) com as strings em arquivos de linguagem.

- **Vigor de carga**: carregar a batida custa 16/s (`STAMINA.CHARGE_DRAIN`).
  Abaixo de 25 (`STAMINA.LOW`) o jogador fica **cansado**: anda a 82% e carrega
  a 60% do ritmo, então os golpes saem mais fracos; a corrida continua
  bloqueada quando a barra esvazia. Nas medições, os jogadores ficam cansados
  de 1% a 3% do tempo e o vigor chega a zero em rallies longos: dá para sentir
  a gestão sem travar o jogo.
- **Recarga**: agora só acontece durante o rally e sem estar carregando; pausa
  no saque e no fim de ponto.
- **i18n**: `src/i18n.js` com tabelas em `src/lang/pt.js` e `src/lang/en.js`,
  `t(chave, {param})`, detecção pelo idioma do navegador e item **Idioma** no
  menu (`Q`/`E` ou `Enter`). Todas as strings do cliente, das telas, do HUD e
  das mensagens do juiz saíram do código; a auditoria confere a paridade das
  chaves e o total foi para 113 testes.

## 23. Ícones de ação no HUD

Feedback: as ações devem ser indicadas por ícones, com o selo **+** para
forehand e **-** para backhand (neutro sem selo).

- **`src/icons.js`**: carrega os SVGs de `assets/icons/vectors/` (golpes,
  saques, turbo, vigor, rede e tiebreak) e resolve a variante pela mão
  (`actionIcon`): forehand usa `-plus`, backhand usa `-minus`, neutro usa a
  versão normal.
- **HUD**: o rótulo do golpe virou o ícone da ação (turbo aparece ao lado,
  a situação do golpe fica como legenda abaixo); a barra de vigor ganhou o
  ícone de vigor e o placar, o ícone do tiebreak.
- **Como jogar**: as linhas de batidas, saques, turbo, tiebreak, rede e vigor
  mostram os ícones, e o layout das colunas foi corrigido (antes a coluna
  direita era cortada em 1280px).
- **Fallback**: sem imagem carregada (ou nos testes em Node), o rótulo em texto
  continua aparecendo. A auditoria confere que todos os ícones declarados
  existem no disco, e o total foi para 117 testes.

## 24. Classes, stats e tela de carregamento

Feedback: stats que afetam as batidas (força, técnica, saque e vigor, de 50 a
99), configuráveis no menu para cada jogador, 8 classes, a IA sorteando a classe
a cada partida e uma tela de carregamento antes do jogo.

- **Stats** (`src/sim/stats.js`): 75 é o neutro (multiplicadores 1,0). Força
  (±15% na velocidade), técnica (menos erro e menos bola na rede), saque (±13%
  de velocidade e precisão) e vigor (±25% na barra e no gasto/recarga).
- **8 classes**: Equilibrado, Potência, Muralha, Sacador, Técnico, Velocista,
  Veterano e Brutamontes, com presets dentro da faixa.
- **Menu "Jogadores"** (item 8): lista os slots do modo, troca a classe com as
  setas e edita as quatro stats (Q/E de 5 em 5, virando "Personalizado"). A CPU
  começa como **Aleatória** e o `createWorld` sorteia a classe com o RNG da
  partida (determinístico por semente).
- **Tela de carregamento**: antes da partida mostra modo, formato, dificuldade,
  contagem de jogadores e um cartão por jogador com classe e stats; ENTER pula a
  contagem de 2,8 s.
- **Equilíbrio**: com classes aleatórias, as partidas de CPU vs CPU seguem entre
  ~16 e ~30 min, com 6,8 a 15 rebatidas por ponto, e o total foi para 126
  testes.

## 25. Traços de classe, segundo quique, ace e estatísticas

Feedback: a classe deve afetar o posicionamento e a escolha de batida da IA; a
tela de carregamento pode ter 5 s; a bola no fundo é curta demais e o ponto só
deve contar no segundo quique (sem parede invisível); saque sem devolução vira
ACE; e o jogo deve rastrear as ações e mostrar estatísticas por set e o total.

- **Traços de IA** (`CLASS_TRAITS`): `net` (avanço à rede), `depth` (jogar atrás
  ou perto da linha), `aggression`, `spin`, `slice` e `lob`. `homeSpot` muda a
  posição de espera e o avanço depois de golpes profundos; `chooseShot` desloca
  as probabilidades de batida por classe (muralha usa mais slice/lob, brutamontes
  mais flat/top spin).
- **Segundo quique**: `processBounce`/`resolveRallyEnd` só decidem o ponto no
  segundo quique; a cerca foi para `y = ±20` e o jogador pode ir 3,2 m atrás da
  linha. `checkBallStopped` resolve o caso da bola que para de rolar.
- **ACE**: saque válido sem toque do recebedor vira `ACE` no aviso, nas
  estatísticas e nos motivos do ponto.
- **Estatísticas**: `makeStats`/`bump` mantêm o total e o set atual, com
  `setHistory`/`setSummary` para os retratos por set. A tela de fim de set mostra
  o painel do set; a de fim de jogo mostra uma coluna por set e o total, com a
  linha de batidas e os motivos dos pontos.
- **Carregamento**: 5 s (ENTER pula).
- **Equilíbrio**: partidas entre ~16 e ~31 min, 4,7 a 15,5 rebatidas por ponto e
  4,6% dos pontos terminando em ace; 131 testes no total.

## 26. Saque em dois estágios (toss + batida)

Feedback: o saque deve ter duas ações para a barra; o primeiro estágio indica a
qualidade e a altura do toss e o segundo é a batida; hoje o toss não afeta nada.

- **Estágio 1 (toss)**: a carga da tecla define a altura (`TOSS_VZ_MIN/MAX` =
  4,8 a 7,6 m/s) e a **qualidade** (`tossQuality`, zona ideal de 60% a 90% da
  barra, marcada em verde). Toss fora da zona sai desviado (`TOSS_ERROR`) e
  derruba a precisão da batida.
- **Estágio 2 (batida)**: a bola sobe e o jogador segura de novo; o release
  perto do alto (`idealZ`, com `CONTACT_TOLERANCE`) dá o melhor saque. Um gauge
  ao lado da bola mostra a altura atual e a zona verde de contato ("SOLTE!").
- **Falta**: se a bola cair abaixo de `HIT_MIN_Z` sem batida, é **toss perdido**
  (falta), como no tênis.
- **IA**: carrega o toss até a zona ideal (com erro conforme a habilidade) e
  solta a batida perto do alto, com erro de timing.
- **UI**: a barra de carga do saque mostra a zona verde do toss; o gauge de
  contato aparece no estágio 2; as dicas explicam os dois estágios. Mensagens de
  "TOSS PERFEITO"/"TOSS RUIM" dão retorno imediato.
- **Equilíbrio**: partidas entre ~17 e ~36 min, aces subiram para ~7,7% e as
  duplas faltas ficaram em ~5,5%; 134 testes no total.

## 27. Aviso de ponto no quique fora e parceiro da dupla

Feedback: o primeiro quique fora pode ser marcado na hora (o segundo quique era
só para não bloquear a busca de uma bola funda); e o parceiro do recebedor não
deve correr atrás da bola do saque.

- **Quique fora decide na hora**: `processBounce` chama `awardPoint` assim que o
  primeiro quique do lado de quem recebeu é fora. Um quique **dentro** continua
  sem encerrar, então a busca da bola funda até o segundo quique segue valendo.
- **Parceiro não persegue o saque**: `planIntercept` devolve `null` para o
  parceiro do recebedor enquanto `serve.returnPending` (ele não pode rebater).
  Na medição em partidas de duplas, o parceiro fica a menos de 3 m da bola em
  0,1% dos frames da devolução.
- **Testes**: 136 no total (novos: quique fora decide na hora, quique dentro
  segue a jogada, parceiro sem interceptação e liberado depois da devolução).

## 28. Batida do saque na queda

Feedback: a bolinha deve ser batida na **queda**; a IA estava batendo assim que
subia; bater durante a subida deve ser punido.

- **Contato na queda**: `CONTACT_IDEAL` passou a 0,88 do pico e o contato bom é
  com `vz < 0` (descendo). `SERVE.RISE_PENALTY` (0,4) multiplica a qualidade
  quando a bola ainda está subindo: o saque sai fraco e impreciso.
- **IA**: espera a bola passar do alto e só solta com `vz < 0`, na altura ideal
  (com erro de timing conforme a habilidade). Medição: **0 batidas na subida**
  em 322 saques de CPU, com qualidade média 0,95 e `contactFactor` médio 0,91.
- **Gauge**: mostra o estado do contato: **ESPERA** (amarelo, subindo), **SOLTE!**
  (verde, caindo na zona) e **TARDE** (vermelho, caiu abaixo da zona).
- **Testes**: 137 no total (novo: queda vs subida na mesma altura, com a subida
  punida em qualidade e velocidade).

## 29. Carga consciente da IA, UI da batida e Power serve

Feedback: a IA carrega batidas de bolas que não vão na direção dela (gasta vigor
à toa); a UI da batida não deixa claro o que fazer (deveria ser SEGURE/BATA, não
ESPERA/SOLTE) e o gauge entrega a sincronia; lob no saque não faz sentido.

- **IA consciente**: `canReach` só deixa a IA começar a carregar se ela chegar
  na interceptação a tempo (com sprint) e se a bola for dela (parceiro sem
  claim não carrega). Medição: os frames de carga da IA caíram de ~18-25% para
  ~10% e o tempo cansado ficou entre 0,1% e 3,2%.
- **UI da batida**: sem gauge; o rótulo perto da bola diz **SEGURE** (subindo),
  **BATA** (na zona, com aro verde na bola) e **TARDE** (passou). A dica ficou
  "SEGURE DE NOVO E BATA NA DESCIDA".
- **Power serve**: a tecla do lob no saque virou o **power** (`speedMul` 1,12,
  rasteiro e com mais erro); o lob continua existindo no rally. A IA usa power
  só no 1º saque.
- **Testes**: 138 no total (novos: IA não carrega bola inalcançável, power no
  lugar do lob nas estatísticas e nos tipos).

## 30. Recebedor preso atrás da linha, área de 100% do toss e ícone do power

Feedback: o recebedor não pode invadir a caixa de serviço durante o saque; o
toss deve ser mais difícil de acertar perfeito, com uma área interna de 100% que
cresce com o stat de saque (área = 90%+); e o power serve deve usar o ícone do
flat com selo + para diferenciar do flat.

- **Recepção**: em `applyPlayerLogic`, enquanto `serve.inFlight` o recebedor é
  preso atrás da linha de saque (`COURT.SERVICE_LINE`); depois do quique ele
  volta a poder atacar. Vale para humanos e IA.
- **Toss graduado**: `tossQuality(charge, serveStat)` dá 100% na área interna
  (`TOSS_PERFECT_MIN/MAX` = 0,02 a 0,09 de meia-largura, crescendo com o saque),
  90% a 99% na área (0,6 a 0,9) e menos de 90% fora dela. A barra desenha a área
  (contorno verde) e a área interna (faixa branca) do tamanho do stat.
- **Ícone do power**: `serveIcon('power')` = `serve-flat-plus` (flat com selo +),
  diferente do `serve-flat` do saque flat; teste fixa o mapeamento.
- **Equilíbrio**: aces em ~8,3% e duplas faltas em ~5,4%; 141 testes no total.
