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
