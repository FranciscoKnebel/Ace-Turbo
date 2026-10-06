# Ace Turbo: Regras

Documento de referência do que o jogo implementa, em duas camadas:

1. **Regras de tênis**: oficiais, com as simplificações do protótipo marcadas.
2. **Mecânicas de jogo**: criação própria (tipos de batida, turbo, co-op etc.).

Para a parte técnica, veja [IMPLEMENTACAO.md](./IMPLEMENTACAO.md). Para jogar,
veja o [README](../README.md).

---

## 1. Partida

- Duração: **1 set** (padrão) ou **melhor de 3 sets** (`Q`/`E` no menu).
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
- **Lado (deuce/ad)**: pela **paridade do total de pontos do game**: par saca do
  lado direito (deuce), ímpar do lado esquerdo (ad), no referencial do sacador.
- **Caixa válida**: a bola precisa cair na **caixa de serviço diagonal** (lado
  oposto ao do sacador), entre a rede e a linha de saque.
- **1º e 2º saque**: uma falta dá a segunda tentativa; duas faltas = **dupla
  falta** (ponto do recebedor). Depois de uma falta (ou de um let), as
  **posições de saque são restauradas**: o sacador volta para trás da linha e o
  recebedor (e os parceiros) voltam para a formação.
- **Let**: saque que toca a rede e cai na caixa correta é **repetido** (mesma
  tentativa). Se tocar a rede e cair fora, é falta normal.
- **Recepção**: durante o saque (bola em voo) o recebedor espera **atrás da
  linha de saque**: ele não pode invadir a caixa de serviço antes do quique.
  A IA favorece ficar **na altura da linha de fundo** e deixa a bola vir até
  ela, em vez de correr para o meio da quadra (a posição de espera segue a
  formação, não a bola, que durante o toss está do outro lado). Depois do
  quique, pode atacar a bola normalmente.
- **Devolução**: o recebedor pode devolver **antes do quique** (voleio): o
  ponto continua e não é ace. Em duplas, a devolução é **sempre do recebedor
  designado** (o jogador do lado que recebeu o saque); o parceiro da rede não
  pode roubar a devolução e, na IA, **não corre atrás da bola do saque** (ele
  não pode rebater mesmo).
- **Posições**: o sacador fica atrás da linha de fundo; o recebedor espera
  **perto da linha de fundo**; em duplas o parceiro do sacador e o parceiro do
  recebedor ficam próximos da rede.
- **Saque em dois estágios**: a **primeira carga** (segurar a tecla) é o
  **toss**: a barra tem uma **área** (60% a 90% da carga) que vale **90%+** de
  qualidade e uma **área interna** (em volta de 75%) que vale **100%**; a área
  interna **cresce com o stat de saque** do jogador (saque 99 tem a área bem
  maior que saque 50). Fora da área a qualidade cai rápido. A carga também
  define a altura do lançamento. A **segunda carga** é a **batida**: segure de novo e
  solte **na queda**, quando a bola estiver na **zona verde de contato** (logo
  abaixo do alto do toss). **Bater na subida é punido** (saque fraco e
  impreciso): o contato bom é na descida. Queda na altura ideal + toss na zona
  = saque mais forte e preciso; toss fora da zona sai desviado e derruba a
  precisão; se a bola cair sem ser batida, é **falta** (toss perdido).
- **Controle de direção**: durante o saque, a mira é mostrada na quadra e as
  teclas de direção escolhem o ponto de queda dentro da caixa (laterais, centro,
  curta ou funda). A carga controla a velocidade e a precisão.
- **Força**: os saques são fortes (o flat chega a ~25 m/s com carga alta); o
  slice sai visivelmente mais lento e o **power** é o mais rápido de todos.
- **UI do estágio 2**: sem gauge; o rótulo perto da bola indica a hora
  (**SEGURE** enquanto a bola sobe, **BATA** na zona de contato e **TARDE** se
  passou) e um aro verde na bola marca o momento certo.

### Tipos de saque (mesmas teclas das batidas)

| Tipo | Tecla (P1 / P2) | Comportamento |
| --- | --- | --- |
| **Flat** | `Espaço` / `Enter` | rápido e rasteiro (saque padrão) |
| **Top spin (kick)** | `J` / `,` | quica **alto** e mais fundo; mais arriscado |
| **Slice** | `K` / `.` | mais lento, **baixo**, **aberto** (perto da lateral) e com **curva lateral** |
| **Power** | `L` / `/` | o mais **rápido** e rasteiro, com **mais risco** (a tecla do lob); no HUD usa o ícone do flat com **selo +** |

## 4. Rally

- A bola pode **quicar uma vez** em cada lado. No **segundo quique** do mesmo
  lado, o ponto é de quem bateu (vale mesmo se o segundo quique sair).
- Os quiques são **altos** (a bola sobe bem depois de tocar o chão), o que dá
  mais tempo para se preparar: top spin quica mais alto, slice fica baixo.
- **Bola fora** (quique fora das linhas) → ponto do adversário **na hora**.
  Um quique **dentro** (mesmo fundo, perto da linha) **não** encerra: a jogada
  segue até o segundo quique, o que dá chance de buscar a bola antes do ponto
  ser chamado.
- **Ace**: saque válido que o recebedor não toca vira ACE no aviso e nas
  estatísticas (o ponto é do sacador).
- **Bola na rede** que cai do lado de quem bateu → ponto do adversário. Se
  passar (net cord), o jogo continua.
- Bola que passa a **cerca** depois de um quique válido → ponto de quem bateu
  (o adversário não devolveu).
- **Turnos**: um time não pode bater duas vezes seguidas. Em duplas, qualquer
  jogador do time pode devolver a bola.
- **Rede**: os jogadores não podem cruzar a rede.

### Colisões e posicionamento

- **Entre jogadores**: companheiros de time **não podem ocupar o mesmo espaço**;
  a física separa os dois quando se encostam (ninguém fica sobreposto).
- **Bola no parceiro**: se a bola toca o **parceiro de quem bateu antes de cruzar
  a rede ou quicar**, o time perde o ponto na hora (mensagem
  `BATEU NO PARCEIRO`). Depois de cruzar ou quicar, o toque é ignorado.
- **Bola no adversário**: se a bola **já quicou** e toca um adversário, o time
  dele perde o ponto (mensagem `BATEU NO JOGADOR`).
- Bola na mão do sacador ou em lançamento (toss) não conta como toque.
- A IA considera tudo isso: só o parceiro mais perto persegue a bola, cada um
  cobre a sua metade e quem não vai jogar a bola sai da frente dela.
- **Lado do ponto (duplas)**: a formação do saque define o lado de cada um (o
  sacador e o parceiro **espelham os lados a cada ponto**, como no tênis). A IA
  **mantém o lado da formação** durante o ponto, sem cruzar para trocar de
  posição; ela só cruza para interceptar uma bola que vai naquele lado.
- **Jogo de rede**: quem está adiantado (a menos de 6,5 m da rede) ataca a bola
  **antes do quique** (voleio/smash) em vez de recuar. As classes com traço de
  rede sobem depois de um **golpe profundo e sólido** e podem arriscar o
  **saque-e-voleio**; o lob do adversário é coberto pela interceptação, que
  manda o jogador de volta ao fundo a tempo.

### Pausa entre pontos

- Depois de cada ponto há um anúncio: **2,2 s** (ponto normal) ou **3,4 s**
  (game/set). A **movimentação continua liberada** durante a pausa; apenas os
  golpes ficam bloqueados, porque a bola está morta.

## 5. Mecânicas de jogo

### Golpes fundamentais

| Golpe | O que é | Como aparece no jogo |
| --- | --- | --- |
| **Forehand** | Golpe do lado dominante (o lado da mão que segura a raquete), palma da mão para a frente | Mais rápido e preciso |
| **Backhand** | Golpe do lado oposto, costas da mão para o alvo (uma ou duas mãos) | Mais lento e com mais erro |
| **Voleio** | Golpe curto e firme **antes do quique**, perto da rede | Mais rápido e curto; menos erro |
| **Smash** | Golpe agressivo **acima da cabeça**, resposta a um lob alto | Voo curto e potente, quique mais alto |
| **Meio-voleio** | Golpe defensivo logo **após o quique**, quase colado ao chão (até 0,15 m de altura e 0,07 s após o quique) | Levanta a bola (arco maior), seguro |
| **Saque** | Inicia o ponto, lançado por cima da cabeça de trás da linha de fundo | 4 tipos (flat/kick/slice/power) |
| **Devolução** | Primeiro golpe de fundo de quem recebe o saque, após o quique na área de serviço | Marcada como DEVOLUÇÃO na tela |

O tipo escolhido pelas teclas (flat/topspin/slice/lob) combina com a situação:
um smash com slice vira um smash cortado, um voleio de top spin vira um voleio
pesado, e assim por diante. A etiqueta na tela mostra a situação quando ela é
especial (ex.: `SMASH • FOREHAND`).

### Quadra e condições

A quadra pode ser **Dura** (padrão), **Saibro** ou **Grama**, escolhida no menu
(item **Quadra**). Cada superfície muda o quique:

| Superfície | Quique | Velocidade da bola |
| --- | --- | --- |
| **Dura** | neutro (referência) | neutra |
| **Saibro** | mais **alto** (+12% na restituição) | mais **lenta** (freia mais no chão) |
| **Grama** | mais **baixo** (-14%) | mais **rápida** (mantém mais velocidade) |

A IA prevê a trajetória com a mesma superfície, então o posicionamento se
ajusta ao quique de cada quadra.

### Formatos e regras opcionais

No menu (itens **Partida**, **Último set** e **Vantagem**) dá para mudar o
formato da partida:

- **Partida**: 1 set (rápida), **melhor de 3** (padrão) ou **melhor de 5**.
- **Último set**: **Normal** ou **Super tiebreak**: o set decisivo vira um
  tiebreak de **10 pontos** (vence quem fizer 10 com 2 de vantagem), como nas
  duplas profissionais.
- **Vantagem**: **Vantagem** (padrão) ou **No-ad**: em 40-40 o próximo ponto
  fecha o game (ponto decisivo, sem AD).

### Clima e vento

O menu (item **Clima**) oferece **Noite** (padrão), **Dia**, **Ventania** e
**Aleatório**. O horário muda só a apresentação (paleta de céu e chão); a
**ventania** muda a jogabilidade:

- o vento aplica uma **aceleração constante** na bola (0,5 a 1,3 m/s², direção
  sorteada por partida, com componente lateral);
- o HUD mostra o ícone do clima e, com vento, a **direção e a intensidade**
  (fraco/moderado/forte), além de partículas leves no ar;
- os golpes **miram compensando** o vento (como no tênis real), com um resíduo
  de 15%: dá para jogar, mas o vento ainda exige ajuste;
- a IA prevê a trajetória **com o vento**, então o posicionamento se ajusta.

### Classes e stats (50 a 99)

Cada jogador tem quatro stats: **força**, **técnica**, **saque** e **vigor**, de
50 a 99 (75 é o neutro). Elas afetam as batidas:

- **Força**: velocidade dos golpes (até ±15%) e **absorção de bola pesada**
  (quem tem força devolve melhor o ritmo do adversário).
- **Técnica**: erro de execução e risco de bola na rede (mais técnica, menos
  erro: ±12% no erro de execução).
- **Saque**: velocidade e precisão do saque (±13% de velocidade).
- **Vigor**: tamanho da barra (±25%), custo do sprint (**+35% com vigor 50 a
  −35% com vigor 99**) e velocidade de recarga (±25%). Vigor alto rende bem mais
  sprints por ponto.

**Bola pesada**: golpe rápido (acima de ~13 m/s) é mais difícil de devolver. O
erro de quem devolve cresce com a velocidade da bola recebida e a folga de
alcance da IA encolhe, então bola rápida vira erro ou ponto com mais
frequência. É o que dá valor à força: um brutamontes pressiona mesmo sem
técnica, e quem tem força também sofre menos ao devolver ritmo.

O jogo traz **8 classes** com presets: Equilibrado, Potência, Muralha, Sacador,
Técnico, Velocista, Veterano e Brutamontes. No menu, o item **Jogadores** troca a
classe de cada jogador ou ajusta as stats uma a uma (vira "Personalizado"); a CPU
vem como **Aleatória** e sorteia a classe a cada partida. Antes da partida, a tela
de **carregamento** mostra o modo, o formato e os jogadores com classes e stats.

### Vigor (stamina)

- Segure **Shift** (P1: Shift esquerdo; P2: Shift direito ou Numpad 0) enquanto
  se move para **correr mais rápido** (45% a mais).
- **Correr cansa**: o sprint gasta **26/s** e a corrida normal em alta velocidade
  (acima de 80% do máximo) gasta **3,5/s**. Em ritmo lento a barra **recarrega**
  (8/s; a IA recarrega 60% disso) e a recarga **pausa no saque**.
- **Carregar a batida também gasta** (5/s), mas só **até a carga encher**:
  segurar depois de cheia não custa nada. As cargas do **saque** (toss e
  batida) custam **30%**, então o sacador não começa o ponto com a barra pela
  metade.
- **Cada batida custa 2 pontos** de vigor, com **+2** quando o jogador bate
  correndo ou esticado para alcançar a bola.
- **Pausa entre pontos**: há uma recuperação extra de **12% a 28% da barra**,
  conforme o **stat de vigor** (vigor 50 recupera 12%, vigor 99 recupera 28%).
  O **sacador** do ponto recupera **em dobro** nessa pausa: ele gastou no saque
  e ainda joga o rally em desvantagem em relação a quem só esperou.
- **Cansado**: o desgaste é **gradual**. Abaixo de **60% da barra** a velocidade
  e o ritmo de carga já começam a cair, chegando a **82%** e **60%** com a barra
  vazia. A barra fica **âmbar** nessa faixa e **vermelha e pulsando** abaixo de
  25%. Rallies longos e corridas seguidas fazem o jogador sentir.
- **Fadiga de partida**: a cada set concluído a **barra máxima encolhe** (9% por
  set com vigor 50, 6% com 75 e 3% com 99; nunca abaixo de 50% do máximo). Em
  partidas de 1 set não há fadiga.
- **Forçar o corpo cansado queima a barra**: usar o **sprint** (Shift) com a
  barra abaixo de 60% reduz a **barra máxima pelo resto da partida** em **25% a
  10% do que foi gasto** (vigor 50 queima 25%, vigor 75 queima 18%, vigor 99
  queima 10%), até o limite de **50% do máximo inicial**. Corrida normal, carga e
  batida **não** queimam: são jogo, não abuso. Dá para forçar, mas o corpo cobra
  depois: quem tem vigor alto queima menos e quem não tem sente no fim.
- Com a barra vazia não dá para correr: é preciso parar (ou andar devagar) e
  recuperar antes de voltar a acelerar.
- A **IA também corre e carrega** (usa o mesmo vigor) e recarrega **mais devagar**
  (60% da taxa humana). **Cansada**, ela fica **conservadora**: bate com menos
  força, usa mais slice/lob, mira mais o centro e **não sobe à rede**.

### Batidas (teclas)

Segure a tecla para **carregar** e solte perto da bola para **bater**. As teclas
de direção definem a **mira** (lado e profundidade).

| Batida | Tecla (P1 / P2) | Comportamento |
| --- | --- | --- |
| **Flat** | `Espaço` / `Enter` | segura: profundidade e quique normais, menos erro |
| **Top spin** | `J` / `,` | mais **funda**, **quica mais alto** e é agressiva: **mais risco de sair** |
| **Slice** | `K` / `.` | mais **lenta**, com **quique baixo** e **curva lateral** |
| **Lob** | `L` / `/` | **aérea**, alta e profunda |

### Ícones de ação

As ações são indicadas por **ícones** (`assets/icons/`) no HUD e na tela "Como
jogar": os quatro golpes (flat, top spin, slice, lob), os quatro saques (flat,
kick, slice, lob), turbo, vigor, rede e tiebreak. O **selo do ícone** indica a
mão: **+** para forehand (lado bom) e **-** para backhand (lado ruim); sem selo
quando a batida é neutra.

### Forehand e backhand

A mão é definida pelo **lado do corpo em relação à bola** (jogadores destros):

- bola do lado dominante → **FOREHAND**: a melhor opção (+5% de velocidade e
  erro ×0,85);
- bola do outro lado → **BACKHAND**: mais lenta (-5%) e instável (erro ×1,3);
- bola **em cima do corpo** → **NEUTRO**: o pior caso (-14% de velocidade e erro
  ×1,45). Posicionar-se para bater de forehand (ou encaixar o backhand) rende
  mais do que deixar a bola vir no corpo.

A IA se posiciona para **abrir o forehand**: o alvo de interceptação fica
deslocado para o lado do forehand quando há tempo de chegar (contornando o
backhand) e, quando a bola vem no backhand sem tempo, ela **encaixa o backhand**
em vez de deixar a bola bater no corpo.

O último golpe aparece como **ícone da ação** (com o selo da mão) acima do
jogador; a situação do golpe (devolução, voleio, smash, meio-voleio) aparece
como legenda abaixo do ícone.

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
| **P1** | `W A S D` | `Espaço` | `J` | `K` | `L` |
| **P2** | `← ↑ ↓ →` | `Enter` | `,` (ou `Numpad 1`) | `.` (ou `Numpad 2`) | `/` (ou `Numpad 3`) |

Teclas globais: `R` reinicia, `P`/`Esc` pausa, `M` volta ao menu.
Dificuldades: Fácil, Normal, Difícil, **Injusto** e **Impossível** (acima do
Difícil: mais rápidas que o humano, quase sem erro e com reação imediata; a
Impossível corre a 125% e praticamente não erra).

No menu: `↑`/`↓` escolhe a opção, `1` a `9` são atalhos para cada item,
`Q`/`E` alteram **Dificuldade** e **Partida** (nos modos, use `←`/`→` ou o
número), e `Enter` confirma (na opção **Como jogar**, abre a ajuda).

## 6. Testes por regra

Para facilitar a manutenção, cada regra tem um teste correspondente:

| Regra | Teste |
| --- | --- |
| Pontuação, deuce/AD, games, sets, tiebreak, melhor de 3 | `tests/score.test.js` |
| Balística, quiques, rede (let), cerca | `tests/physics.test.js` |
| Saque (formação, caixa, fault, dupla falta, let, 2º saque) | `tests/world.test.js` |
| Turnos, ace, reinício de ponto | `tests/world.test.js` |
| Batidas (flat/topspin/slice/lob, forehand/backhand) | `tests/shots.test.js` |
| Saque (toss em 2 estágios, tipos, mira, recepção funda) | `tests/serve.test.js` |
| Controles (direções relativas à tela, mira) | `tests/controls.test.js` |
| Troca de lado no Versus | `tests/versus-ends.test.js` |
| Colisão entre companheiros | `tests/world.test.js` |
| Vigor/corrida (Shift) | `tests/stamina.test.js` |
| Devolução sempre do recebedor designado | `tests/world.test.js` |
| Golpes fundamentais (voleio, smash, meio-voleio, devolução) | `tests/shots.test.js` |
| Bola no parceiro / no adversário | `tests/world.test.js` |
| Pausa com movimentação liberada | `tests/world.test.js` |
| Posicionamento da IA (fundo e duplas) | `tests/integration.test.js` |
| Menu (foco, Q/E, numérico, Como jogar) | `tests/render.test.js` |
| Cliente (boot, teclado, menu, ajuda) | `tests/client.test.js` |
| Idioma (pt/en, chaves e tradução) | `tests/i18n.test.js` |
| Ícones de ação (selos +/- e arquivos) | `tests/icons.test.js` |
| Classes e stats (faixa, presets, efeitos) | `tests/stats.test.js` |

## 7. Simplificações do protótipo

- A bola só interage com os jogadores pela regra de toque (parceiro/adversário);
  não há empurrão ou bloqueio de movimento.
- O slice tem **curvatura lateral** (efeito Magnus simplificado, ver acima); os
  demais golpes não têm spin lateral: topspin muda velocidade, altura do quique
  e trajetória, mas não a curvatura no ar.
- Não há vento, sol, desafio de vídeo, hawk-eye nem troca de lado entre sets
  fora do modo Versus.
- O primeiro sacador do set seguinte segue o rodízio contínuo de games.
- A troca de lado do Versus troca o placar junto com os jogadores (o placar é do
  jogador, não da metade da quadra).
