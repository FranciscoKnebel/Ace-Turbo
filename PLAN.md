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
  4,6% dos pontos terminando em ace; 131 testes naquele momento.

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

## 31. Recepção de saque da IA na baseline

Feedback: a IA na recepção corria para o meio da quadra, seguindo a bola do toss
(que está do outro lado), em vez de esperar o saque chegar; deve favorecer ficar
na baseline.

- **Posição de formação**: `formation()` guarda `homeX/homeY` de cada jogador e
  `homeSpot` usa isso enquanto o saque não foi devolvido: o recebedor espera
  fundo e os parceiros na rede, sem seguir a bola. O sacador recupera para o
  **centro da linha de fundo**.
- **Sem interceptação na preparação**: `planIntercept` devolve `null` durante o
  toss (a bola não está em jogo) e o recebedor tem a preferência no claim da
  devolução (o parceiro não pode rebater).
- **Espera na linha**: na devolução, `deepPick` prefere a amostra na altura da
  linha de fundo (referência: a formação, não a posição atual, senão o alvo
  "anda" com o jogador e ele acaba na linha de saque).
- **Ajustes de equilíbrio**: o gate `canReach` ganhou folga (`PLAYER.REACH +
  1,5 m`) para não deixar bolas alcançáveis sem tentativa, e quem não vai jogar
  uma bola que vem em cima sai da frente (`dodgeSpot`). Resultado: rallies de
  ~7 a ~16,7 batidas por ponto, aces em 4,2% e toques no parceiro em 3,8%; 143
  testes no total.

## 32. Punição do neutro e IA abrindo o forehand

Feedback: o jogo deve punir a batida central; os bots usam muito o
posicionamento central em vez de favorecer o forehand.

- **Diagnóstico**: a IA interceptava exatamente na linha da bola, então a bola
  chegava no corpo: **85,8% das batidas eram neutras** (forehand 9,3%).
- **Neutro punido**: bater no corpo virou o pior caso (velocidade ×0,86 e erro
  ×1,45), pior que o backhand (×0,95/×1,3). O forehand segue o melhor
  (×1,05/×0,85).
- **IA abre o forehand**: o alvo de interceptação (e a posição de espera) sai da
  linha da bola para o lado do forehand (`FOREHAND_OFFSET` = 0,9 m, com
  deslocamento proporcional ao tempo disponível); sem tempo no backhand, ela
  encaixa o backhand 0,45 m à frente da linha da bola. O ajuste de posição
  continua até chegar no alvo (não para quando a bola está a 1,2 m).
- **Resultado**: forehand ~63%, backhand ~23%, neutro ~13% (era 9%/5%/86%);
  equilíbrio mantido (6,8 a 9,8 batidas por ponto, partidas de 16,6 a 25,3 min).
  145 testes no total.

## 33. Recuperação de vigor na pausa entre pontos

Feedback: durante a pausa entre pontos, restaurar stamina conforme o stat de
vigor (no máximo 25% da barra; no pior caso 10%).

- **Pausa**: `awardPoint` guarda `world.pauseDuration` (2,2 s no ponto, 3,4 s no
  game/set) e, durante a fase `pointover`, cada jogador recupera
  `PAUSE_REGEN_MIN/MAX` (10% a 25% da barra, conforme o stat de vigor)
  distribuído ao longo da pausa. O sprint durante a pausa continua gastando.
- **Testes**: 146 no total (novo: vigor 50 recupera ~10%, vigor 99 recupera
  ~25% e o meio fica entre os extremos; o teste antigo de "não recarrega no fim
  de ponto" virou "recupera na pausa e recarrega no rally").

## 34. Falta no 1º saque restaura a formação

Feedback: após uma falta no primeiro saque, resetar a posição do receptor.

- **Replay**: `replayServe` (chamado na falta e no let) agora usa
  `formation(world, server)` para reposicionar sacador, recebedor e parceiros,
  zerando as velocidades. Antes só o sacador voltava para o ponto de saque e o
  recebedor ficava onde parou, o que desequilibrava o 2º saque.
- **Testes**: 147 no total (novo: o recebedor e o parceiro voltam para a
  formação depois da falta, com as velocidades zeradas).

## 35. Ace contabilizava mas não resetava o saque

Feedback: o ponto não estava acabando; o ace era contabilizado, mas o jogo não
voltava para o saque.

- **Causa**: um swing que estava ativo quando o ponto terminava continuava na
  pausa e acertava a bola morta; `executeRallyShot` então setava
  `world.phase = 'rally'` (porque a bola era o saque), cancelando o
  `pointover`. O `resetForServe` nunca rodava e o jogo ficava em rally. Em 6
  partidas de CPU vs CPU, 5 pontos apresentaram o problema (todos depois de
  ACE).
- **Correção**: `tryHit` e `executeRallyShot` só rodam nas fases `serve`/`rally`;
  a carga também só processa nessas fases (nada de gastar vigor com a bola
  morta); e `awardPoint` limpa `swing`/`charging` de todos ao encerrar o ponto.
- **Testes**: 149 no total (novos: "depois do ace, um swing ativo não cancela o
  reset para o saque" e "não há carga nem gasto de vigor na pausa do ponto").
  Verificação em 6 partidas: 0 pontos revertidos para rally (era 5).

## 36. Pendências do review final da stack

O review independente da stack completa apontou pendências (duas graves e várias
menores), todas corrigidas aqui.

- **Classe aleatória da CPU**: sem configuração no menu, `makePlayer` usava o
  fallback equilibrado; agora slots não humanos recebem `{ classId: 'random' }`
  e sorteiam a classe a cada partida (como o menu e os docs prometiam).
- **Desvio da IA**: o cálculo de aproximação tinha o sinal invertido (a IA saía
  da frente de bolas que se afastavam); virou a função testável
  `isBallIncoming`, usada no `stepAI`.
- **Resumo do set**: `resetForServe` limpa `setSummary`, então o painel do set
  encerrado não reaparece nas pausas do set seguinte.
- **Selo do turbo**: o ícone do turbo segue a mão do golpe (`turbo-plus`,
  `turbo-minus` e `turbo`).
- **Toss perfeito**: a mensagem "TOSS PERFEITO" fica restrita à área interna de
  100% (`quality >= 0,999`), não à área de 90%+.
- **Ace**: só conta quando o motivo do ponto é `ACE` (toque no corpo do
  recebedor não vira ace).
- **Previsão**: `predictTrajectory` considera `bounceScale`, então a IA prevê o
  quique de topspin/slice como ele acontece.
- **Dead code**: removidos `aimKeys` e `PLAYER.HIT_COOLDOWN`.
- **Docs**: números e afirmações corrigidos (157 testes, atalhos 1 a 9, cinco
  dificuldades, cerca 20/12, power no saque, curvatura do slice, forehand 1,05).
- **Testes**: 157 no total (novos: sorteio da classe da CPU, `isBallIncoming`,
  claim em duplas com alvos divergentes, resumo do set sem vazamento, ace no
  corpo, TOSS PERFEITO só em 100% e turbo no backhand).

## 37. Publicação no GitHub Pages

- **Workflow** `.github/workflows/pages.yml` (**Deploy to GitHub Pages**, nomes
  em inglês): roda `npm test` e `npm run audit:docs`, monta `_site`
  (`index.html` + `src` + `assets`) e publica no GitHub Pages a cada push na
  `main` (ou via `workflow_dispatch`). Usa Node 24 e as versões atuais das
  actions (`checkout@v7`, `setup-node@v7`, `configure-pages@v6`,
  `upload-pages-artifact@v5`, `deploy-pages@v5`); a primeira execução tenta
  habilitar o Pages sozinha (`enablement: true`). O jogo é estático e usa
  caminhos relativos, então funciona no subdiretório do Pages.
- **Estado final**: 158 testes, 71 verificações de auditoria e review
  independente aprovado.
## 38. Superfícies da quadra (duro, saibro e grama)

Evolução pedida no planejamento: superfícies que mudam a física do jogo.

- **Física**: `SURFACES` em `constants.js` (duro 1/1; saibro `bounce` 1,12 e
  `keep` 0,92; grama `bounce` 0,86 e `keep` 1,1). `stepBall` e
  `predictTrajectory` aplicam os fatores no quique, então a IA prevê o quique
  de cada quadra.
- **Menu**: item **Quadra** (Dura/Saibro/Grama) com prévia nas cores da quadra;
  a escolha vai para `createWorld({ surface })` e aparece na tela de
  carregamento.
- **Render**: `drawCourt` troca a paleta (azul, saibro laranja, grama verde).
- **Testes**: 162 no total (novos: quique por superfície na física e na
  previsão, propagação no mundo e cor/linha no menu e no carregamento).

## 39. Clima e vento (dia, noite e ventania)

Evolução pedida no planejamento: clima que muda a apresentação e a física.

- **Clima**: `WEATHERS`/`WEATHER_ORDER` (Noite, Dia, Ventania, Aleatório);
  `resolveWeather` sorteia a ventania (0,5 a 1,3 m/s², direção com componente
  lateral) e a bola carrega `ball.wind`.
- **Física**: o `substep` soma `wind * dt` à velocidade e a `predictTrajectory`
  faz o mesmo, então a IA prevê a bola com vento.
- **Render**: paletas de céu/chão de dia e de noite, badge do clima
  (sol/lua/vento) com seta e intensidade do vento, partículas na direção do
  vento (`world.elapsed`) e a linha do clima no carregamento.
- **Testes**: 165 no total (novos: vento na física e na previsão, resolução do
  clima no mundo, paleta de dia e badge no HUD).

## 40. Vigor rebalanceado (saque, batida, corrida e cansaço gradual)

Revisão pedida: a barra era punitiva para o sacador (duas cargas sem recarga,
~47 de vigor por saque) e quase invisível para os demais.

- **Saque**: as cargas do saque (toss e batida) custam 30% (`SERVE_CHARGE_MUL`);
  medido, o saque passou a custar 3 a 8% da barra, quase tudo deslocamento.
- **Batida**: 2 de vigor por golpe (+2 se bateu correndo ou esticado).
- **Corrida**: sprint 26/s e corrida normal em alta velocidade 3,5/s; a recarga
  (8/s, IA 60%) só acontece em ritmo lento e pausa no saque.
- **Cansaço gradual**: abaixo de 60% da barra a velocidade e o ritmo de carga
  caem proporcionalmente até 82%/60% com a barra vazia (antes era um degrau
  em 25).
- **Pausa entre pontos**: 12% a 28% da barra conforme o vigor.
- **Medição** (CPU vs CPU, 6 seeds): 21,1 min por partida, 6,8 rebatidas por
  ponto, barra média 0,76, 10,9% do rally abaixo de 25% e penalidade ativa em
  28,8% do tempo de rally.
- **Testes**: 171 no total (novos: carga cheia não gasta, saque mais barato que
  o rally, custo por batida com extra esticado, cansaço gradual e recarga lenta).

## 41. Fadiga de partida e aviso visual de cansaço

Complemento do rebalanceio do vigor (seção 40).

- **Fadiga** (`FATIGUE`): ao fim de cada set, `applySetFatigue` encolhe a barra
  máxima em 9% (vigor 50), 6% (75) ou 3% (99) por set, com piso de 50% do
  máximo; `staminaMaxOf` passa a devolver a barra efetiva (usada no clamp, na
  recarga e no desenho).
- **Aviso visual**: `staminaBarColor` define azul, âmbar (a partir de 60%) e
  vermelho (abaixo de 25%); a barra cansada pulsa (sem rótulo: barra, cor e
  ícone bastam). A barra da IA agora tem o mesmo tamanho da humana.
- **Testes**: 175 no total (novos: fadiga por set com limites, fadiga ao vencer
  um set, cores da barra e aviso de cansado para humano e IA).

## 42. Duplas: lado do ponto vem da formação (sem cruzar)

Correção pedida: a IA voltava para o lado preferido fixo (`prefSide`) no rally,
mesmo quando a formação do saque a colocava no outro lado. Como o sacador e o
parceiro espelham os lados a cada ponto (como no tênis), P1 (que prefere a
direita) sacando na esquerda corria de volta para a direita, deixando o lado
esquerdo aberto para a bola cruzada.

- `formation()` grava `player.pointSide` (o lado da formação); `homeSpot` e o
  dodge passam a usar esse lado; `prefSide` segue valendo só para a escolha do
  recebedor e como fallback.
- **Medição** (CPU vs CPU, 3 seeds): tempo de rally no lado oposto ao da
  formação caiu de **21,3% para 2,2%** (18,3% para 0,6% no lado oposto e longe,
  que é só interceptação legítima); bolas no parceiro caíram de 3% para 1% dos
  pontos. Balanço: 17,3 min por partida e 7,4 rebatidas por ponto.
- **Testes**: 176 no total (novo: o lado da formação é mantido no rally).

## 43. Restore em dobro para o sacador e IA conservadora quando cansada

Ajustes pedidos depois do rebalanceio do vigor.

- **Pausa entre pontos**: o **sacador** do ponto recebe `PAUSE_REGEN_SERVER`
  (2x) na recuperação da pausa. Medido, o sacador passou a começar o rally no
  mesmo nível dos demais (0,87 contra 0,85 da média; antes 0,74 contra 0,82).
- **IA conservadora quando cansada** (`tirednessOf`): `chooseShot` aumenta
  slice/lob e reduz a força e a profundidade do alvo; `chooseAimX` joga mais
  pelo centro; o avanço à rede não acumula. Medição (500 amostras, vigor 5%
  contra cheio): topspin 258 para 148, slice+lob 130 para 230, força média 0,78
  para 0,49, alvo curto 17% para 54%, mira no centro 30% para 60%; golpes de
  quem está muito cansado erram 5,1% (antes 5,9%).
- **Testes**: 179 no total (novos: restore em dobro do sacador, mistura de
  golpes/força/alvo da IA cansada e mira no centro).

## 44. Força com efeito: bola pesada, técnica ±12% e alcance por velocidade

Correção do desequilíbrio entre classes: o técnico atropelava o brutamontes
(24-2 em games) porque a técnica era o único modificador decisivo e a força não
criava dificuldade (bola rápida era 3,8% dos golpes e quem devolvia errava
menos nela).

- **Bola pesada** (`PHYS.HEAVY_SPEED/ERROR/MAX`): acima de 13 m/s o erro de
  quem devolve cresce 0,045 por m/s (teto 0,3), amenizado por `heavyResistMul`
  (força: ±25%). A força vira arma de ataque e de defesa.
- **Técnica** de ±30% para ±12% no erro de execução.
- **Alcance da IA** (`canReach`) encolhe até 35% com a velocidade da bola (a
  devolução de saque mantém a folga), então bola rápida vira winner.
- **Medição** (CPU vs CPU, 8 partidas por confronto): técnico x brutamontes de
  **92% para 68% dos games** (49-23); potência x muralha de 9-25 para **40-38**
  (4-4 em partidas); bola rápida gera 16,5% de erro e 4,1% de winner (antes
  3,8% e 0%). Balanço geral: 17,2 min, 6,4 rebatidas por ponto, aces 2,9%,
  duplas faltas 5,8%.
- **Testes**: 180 no total (novo: bola pesada aumenta o erro de quem devolve).

## 45. Queima de vigor por forçar o corpo cansado

Pedido: punir quem força o vigor na zona de cansaço e valorizar o stat de vigor
(ajuda a equilibrar veterano/técnico, que têm vigor baixo).

- **Mecânica** (`STAMINA.BURN_MAX/BURN_MIN`): só o **sprint** liga a queima
  (`spendStamina(p, amount, true)`); corrida, carga e batida não queimam. Com a
  barra abaixo de `TIRED_FROM` (60%), parte do sprint vira `p.burn` (25% com
  vigor 50, 10% com vigor 99). `staminaMaxOf` soma fadiga e queima, com piso de
  50% do máximo inicial. A redução é permanente na partida.
- **Medição da queima** (uma partida): vigor 99 queima 0,7 a 4,5% da barra;
  vigor 75-78, 7,3 a 7,7%; vigor 64, 40 a 49% (chega perto do piso de 50%). A
  diferença entre vigor 99 e vigor 64 fica em 10 a 50x, sem saturar de imediato.
- **Matriz de classes** (1.080 partidas; sem queima -> queima total -> só
  sprint): Veterano 83% -> 80% -> **76%**; Técnico 70% -> 71% -> 70%; Muralha
  48% -> 58% -> 53%; Equilibrado 45% -> 46% -> 50%; Sacador 50% -> 53% -> 50%;
  Potência 40% -> 37% -> 39%; Velocista 38% -> 33% -> 35%; Brutamontes 25% ->
  22% -> 27%. O veterano (vigor 56) é o maior perdedor, como pedido; o velocista
  não melhora porque perde no saque/retorno, não no vigor.
- **Testes**: 184 no total (novos: só o sprint queima, correr cansado queima,
  vigor baixo queima mais, piso de 50% e queima permanente).

## 46. Velocista utilizável e vigor rendendo dentro do set

Pedido: dar ao velocista saque/técnica utilizáveis e fazer o vigor pagar dentro
do set (mais sprints), sem mexer no spread do saque por ora.

- **Preset**: velocista 64/72/60/99 -> **64/78/75/99** (o vigor 99 segue como
  identidade).
- **Sprint mais barato com vigor alto**: `staminaDrainMul` de ±20% para **±35%**
  e `staminaRegenMul` de ±20% para ±25%. Sprint do zero à exaustão: ~2,1 s com
  vigor 50 contra ~7,4 s com vigor 99 (antes 2,7 s contra 6,0 s).
- **Medição do saque** (a matriz tem células de 30 partidas, ±9 p.p., então a
  decisão saiu de uma medição focada): velocista contra as 8 classes, 10 seeds x
  2 lados x 5 dificuldades = **800 partidas por versão**. Saque 70: 40,4% das
  partidas e 46,4% dos games; **saque 75: 42,6% e 47,1%**, com 10% -> 22% contra
  o Técnico. Mantido o 75.
- **Confronto controlado** (8 seeds, velocista x equilibrado): com saque 70 o
  velocista fazia 37 x 41 games; com 75, **42 x 41** (empate), com duplas faltas
  5,5% -> 4,7%. A força 64 (a menor do jogo) segue sendo o teto da classe.
- **Testes**: 186 no total (novos: preset do velocista e sprint rendendo mais
  com vigor alto).

## 47. Jogo de rede da IA (voleio, smash e saque-e-voleio)

Expansão pedida: a IA só jogava de fundo (esperava sempre o quique).

- **Voleio** (`NET` em `constants.js`): `planIntercept` tenta o `volleyPick`
  quando o jogador está adiantado (`|y| < 6,5`): o contato acontece **antes do
  quique**, na altura de voleio e perto da rede; quem está no fundo segue
  esperando o quique.
- **Subida**: `ai.approach` acumula depois de um golpe profundo **e sólido**
  (`holdTarget >= 0,6`), decai em `NET.DECAY` e vira **saque-e-voleio** para
  quem tem traço de rede alto; o sacador em saque-e-voleio não recua para a
  linha de fundo. O velocista deixou de ser net rusher (net 0,55 -> 0,35): sem
  força, subir à rede era um prejuízo.
- **Presença**: o smash sai `NET.SMASH_SPEED` (1,22) mais forte e quem tem um
  adversário adiantado sofre `NET.PRESSURE` (0,16) de erro extra para passar.
- **Medição**: voleios 0 -> 7 e smashes 0 -> 106 em 3 partidas; tempo adiantado
  5,3% -> 17,7%; winners 20% -> 24-28% dos pontos e erros 72% -> 63-65%.
- **Matriz** (1.080 partidas por versão, sem rede -> com rede): Técnico 72 ->
  70, Veterano 79 -> 66, Muralha 55 -> 52, Equilibrado 45 -> 49, Sacador 51 ->
  47, Velocista 37 -> 43, Potência 37 -> 38, Brutamontes 24 -> 36. A rede
  **comprimiu o meta**: o topo caiu 13 e o fundo subiu 12, e a força ganhou um
  caminho (o brutamontes é o maior beneficiado).
- **Testes**: 189 no total (novos: voleio antes do quique, quem está no fundo
  espera o quique, e saque-e-voleio não recua).

## 48. Formatos e regras opcionais (melhor de 5, super tiebreak e no-ad)

Expansão pedida: formatos de partida no menu.

- **MatchScore**: `noAd` (em 40-40 o próximo ponto fecha o game, sem vantagem) e
  `superTiebreak` (o set decisivo vira tiebreak de `tbTarget` 10, com o mesmo
  rodízio de saque). `bestOf` já aceitava 1/3; agora o menu oferece **5**.
- **Menu**: novas linhas **Partida** (1/3/5), **Último set** (normal/super) e
  **Vantagem** (vantagem/no-ad), com Q/E; o formato aparece na tela de
  carregamento e o placar mostra "Super tiebreak" quando for o caso.
- **Testes**: 192 no total (novos: melhor de 5, no-ad em 40-40, super tiebreak
  de 10 pontos, opções no menu e no `createWorld`).

## 49. Faxina: docs atualizados e matriz de equilíbrio versionada

- **Docs**: as limitações perderam o vento e a "seleção de personagens" (as
  classes existem) e a IA deixou de ser "sem personalidade" (os traços de classe
  existem); o README ganhou a seção de equilíbrio e a contagem de testes.
- **Ferramenta**: `scripts/balance-matrix.mjs` (npm run balance:matrix) roda a
  matriz de classes contra classes (vitórias, games e break points por
  dificuldade) e o modo focado (`--class X --seeds N`) usado para decisões
  finas. Era o script que vivia em /tmp e agora fica no repositório.
- **Testes**: 194 (sem mudança de comportamento).

## 50. Menu com Configurações por categoria

Pedido: o menu estava com itens demais (4 modos + dificuldade + formato + último
set + vantagem + idioma + quadra + clima + jogadores + ajuda = 12 linhas) e as
opções de partida precisavam de uma tela própria.

- **Menu principal**: 4 modos + **Configurações** + **Jogadores** + **Como
  jogar** (7 linhas, atalhos 1-7; a dica mostra o total).
- **Configurações** (`drawSettings`): categorias **Partida** (dificuldade,
  formato, último set, vantagem), **Quadra** (superfície, clima) e **Geral**
  (idioma), com abas; `↑`/`↓` escolhe, `←`/`→` troca a categoria, `Q`/`E` altera
  e `Enter`/`Esc` volta. O estado é `menu.settings = { category, focus }` e o
  ciclo de valores foi extraído para `cycleSetting` (usado nas duas telas).
- **Testes**: 194 no total (atualizados: menu principal, tela de configurações,
  Q/E por categoria, atalhos e o inglês).

## 51. Reação da IA à rede (lob e passada)

Pedido: a escolha da batida da IA deve considerar o posicionamento do
adversário. O foco é a reação à rede (o drop shot fica para depois).

- **`netOpponents(world, player)`**: conta os adversários adiantados (`|y| <
  NET.VOLLEY_Y`).
- **`chooseShot`**: com um adversário adiantado, a chance de **lob** sobe
  `NET.COUNTER_LOB` (0,22) por adversário. Medido (600 amostras, equilibrado):
  lob 9% (adversário fundo) -> **31%** (na rede).
- **`chooseAimX`**: contra a rede, a chance de mirar o **centro** cai
  `NET.COUNTER_CENTER` (0,18); medido: centro 27% -> **11%**, o resto vira
  passada para o lado aberto.
- **Testes**: 195 no total (novo: reação à rede com mais lob e menos centro).

## 53. Julgamento de bola fora (margem de dúvida) e a linha contando

Pedido: a IA desistia de bolas fora por muito pouco, sem a insegurança de um
jogador real, e a linha precisava contar na demarcação.

- **Linha**: `isInCourt` agora considera o **raio da bola** (basta tocar a
  linha; antes só o centro era testado).
- **Margem de dúvida** (`JUDGE.OUT_MARGIN` 0,35 m com jitter de ±25%): a IA só
  desiste quando a bola está bem fora; dentro da margem ela vai nela e marca a
  jogada como `doubtful`.
- **Tiro seguro**: na bola duvidosa o `chooseShot` usa mais slice/lob e 20%
  menos força (errar de uma posição ruim era pior que deixar passar).
- **Medição**: tempo de "deixa passar" da IA caiu de **4,14% para 1,30%** do
  rally; 63% das bolas fora são por ≤0,5 m (as duvidosas). Efeito colateral: os
  rallies alongaram (7,1 -> ~10 rebatidas por ponto) e os pontos passam a
  terminar mais em erro (FORA 66% -> 81%, winners 24% -> ~10%), porque a IA
  alcança mais bolas e a fadiga acumula.
- **Testes**: 203 no total (novos: a linha com o raio, a margem de dúvida com o
  flag `doubtful` e o tiro seguro).

## 52. Brutamontes com técnica 60

Pedido: melhorar as stats do brutamontes, que era o pior da matriz (27% com a
reação à rede).

- **Preset**: `bruiser` de 99/**50**/88/78 para 99/**60**/88/78 (segue a menor
  técnica do jogo junto com o potência, que tem 60).
- **Medição focada** (480 partidas por variante, `npm run balance:matrix --
  --class bruiser --seeds 6`): técnica 50 -> 26,5%; 56 -> 30,2%; **60 -> 32,5%**;
  60 + traços suavizados -> 34,6%; 64 + traços -> 37,3%. Escolhido o 60, que
  mantém a identidade agressiva (agressão 0,95 e slice/lob 0,1).
- Os traços suavizados valem ~+2 pontos se quisermos ir além; o 64 chega a
  +11 mas sombreia o potência (95/60/85/70) em todas as stats.

