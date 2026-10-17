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
