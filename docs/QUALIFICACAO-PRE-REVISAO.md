# Qualificação antes da revisão humana

Nova pilha de seis PRs sobre o head do #69. Cada camada acrescenta evidências
à mesma árvore. Não altera parâmetros de equilíbrio nem amplia o suporte
prometido a dispositivos móveis/gamepad.

## 1. Gameplay integrado

`node scripts/browser-gameplay.mjs` executa teclas reais pelo Playwright em
Versus: carga, toss, saque e contato dos dois jogadores, incluindo contagem
de pontos. Uma partida Demo termina pelo controlador normal, com placar e
estatísticas reais comparados ao histórico e à transcrição HTML.

O harness acelera exclusivamente o relógio/RAF do teste, com seed 21. O
controlador, teclado, física, regras, desenho Canvas e DOM são os de produção.
O observador copia eventos sem consumir RNG; não injeta placar, posições,
vitória nem comandos diretamente na simulação. Não é teste de velocidade
real, hardware ou som ouvido. Evidência: `qualification-gameplay.json` no
artefato `browser-smoke` do CI. Falhas de caso são preservadas no JSON.

## 2. Falhas de mídia e áudio nativo

`node scripts/browser-resilience.mjs` segura a requisição de landing, provoca
HTTP 404 no logo e verifica desenho fallback e navegação durante o atraso.
Libera a rede, refaz o logo por retry e confirma decode/prontidão/desenho dos
assets reais. O HTTP 404 é esperado apenas nesse cenário explícito.

Um segundo caso observa AudioContext e osciladores nativos: nenhum contexto
no boot/início silenciado, suspensão e resume após interação, cancelamento
de notas futuras no mute, fim das vozes e fechamento no dispose. Não substitui
ouvir o áudio nem comprova todas as políticas de autoplay dos dispositivos.
Evidência: `qualification-resilience.json`.

## 3. Foco, resize e ciclo de vida

`node scripts/browser-lifecycle.mjs` mantém Space/seta pressionadas, envia
blur ao adaptador DOM, confirma pausa sem avanço da simulação e ausência de
comandos presos ao retomar. Esse caso não simula desativação de janela no SO.

Resize em partida: 1280×720, 640×360, 390×844 e retorno, nos DPR 1 e 2;
confere dimensões físicas/CSS e transformação do Canvas sem mudar de tela.
Não equivale a operar controles de zoom do navegador/SO.

Vinte ciclos exercitam boot idempotente, início, restart, menu, dispose e
remontagem. Contam listeners reais de teclado/blur/resize e RAF pendentes:
um loop por cliente, nenhum listener/frame após dispose. Evidência:
`qualification-lifecycle.json`.

## 4. Acessibilidade HTML e teclado

`node scripts/browser-accessibility.mjs` percorre Canvas, summary, select e
botão de início por Tab/Enter/End; confirma foco visível e retorno ao Canvas.
Escape fecha o menu HTML e devolve o foco, sem propagar um comando ao jogo.
O documento passa a ter landmark main e título h1 acessível.
Controles têm cores explícitas para preservar contraste entre engines.

Axe 4.13 audita todas as regras padrão, sem exclusões, em PT/EN: menu fechado,
aberto, ajuda, partida e resultado. O resultado usa uma fixture de apresentação
de cinco sets com valores únicos não nulos, distinta da partida real do item 1.
Confere cada linha da transcrição, lang, nome do Canvas e região de status.
`accessibility-scans.json` preserva violações e verificações inconclusivas;
`qualification-accessibility.json` registra os casos. Zero violações automáticas
não certifica leitura por screen reader, contraste do Canvas ou operação física.

## 5. Chromium, Firefox e WebKit

O CI executa as mesmas cinco suites em três jobs independentes, com fail-fast
 desativado. `BROWSER=firefox node scripts/browser-qualification.mjs` seleciona
um engine; o padrão é Chromium. Playwright 1.62.1, axe adapter/core 4.13.0
estão fixados. Instale as dependências do workflow e execute
`npx playwright install --with-deps chromium firefox webkit` antes da suite.

Cada suite tem limite de cinco minutos; falhas não impedem coleta das demais.
Os artefatos agora são `browser-chromium`, `browser-firefox`, `browser-webkit`,
com JSONs e 96 screenshots por engine sob a respectiva subpasta. Os relatórios
registram engine, versão real, Node, Playwright e plataforma. Esta mudança de
nome substitui a referência anterior ao artefato `browser-smoke`.
WebKit headless Linux não certifica Safari/iOS, nem Firefox/Chromium em outros
sistemas operacionais. Não há snapshots de pixels compartilhados entre engines.
O runner fornece saída PulseAudio virtual para os três engines. As APIs/contextos
continuam nativos; o sink não produz uma avaliação auditiva. Falhas de resume
incluem estados, rejeições e ativação do usuário no diagnóstico, sem relaxar a
asserção de retorno a running nem alterar preferências de autoplay.
