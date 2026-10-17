# Cobertura do plano de refatoração

Conferência do head do PR 65 (`12757f7449c9314f4034f59ab311867d8a0fa1b1`)
contra os problemas B01–B09 e frentes R01–R16 da revisão original. A existência
dos 12 PRs não bastava para encerrar todos os critérios. Os complementos
13–16 fecham as lacunas de implementação e validação automatizada.

## Problemas reproduzidos

| Item | Evidência no topo complementado | Validação |
|---|---|---|
| B01, B08: modo e boot | `app/controller.js`, `app/browser.js`; ativação usa `modeId` | `client.test.js`, `headless-controller.test.js`: quatro modos e três telas com estado afirmado |
| B02: previsão diferente | `physics/kernel.js` é o integrador de runtime e previsão | `predictor-parity.test.js`: rede/fita, curva, vento, pisos, quique/rolagem, cópia imutável |
| B03: curva residual | `resetBall()` em todos os resets do saque | `serve-state.test.js`: novo ponto, toss, fault e let |
| B04: horizonte oculto | previsão coleta sem limite arbitrário e informa elapsed/horizon/termination | `predictor-parity.test.js`: 4,5 s, amostragem de 20 ms e paradas explicadas |
| B05: conteúdo fora da tela | componentes compactos, quebra/paginação de ajuda e estatísticas | `layout-bounds.test.js`: PT/EN, três viewports e cinco sets; smoke Chromium e inspeção de capturas no CI |
| B06: histórico invertido | identidade `team` estável, lado físico separado | `team-identity.test.js`, `versus-ends.test.js`: snapshots e pontos após trocas |
| B07: alvo power | tipo normalizado e alvo compartilhado no preview/execução | `serve-state.test.js`: quatro ações, profundidades e tentativas |
| B09: tap perdido | fila de transições consumida uma vez por tick | `input-edges.test.js`, `headless-controller.test.js`: press/release, blur e frames 30/60/144 Hz |

## Frentes e critérios de encerramento

| Item | Implementação/evidência | Status |
|---|---|---|
| R01: orquestrador | `world.js` mantém criação/ordem; `serve.js`, `shots.js`, `rules.js` e sistemas próprios | Implementado; replays exatos |
| R02: fases | estados prepare/toss/flight/return/rally/pause/end; entradas completas e `assertMatchInvariants()` | Implementado; fault/let, incompatibilidade, fim de set/jogo e runner |
| R03: identidade/rodízio | `court-sides.js`, `service-order.js`, `service.js`; placar mantém contadores, componente decide rotação | Implementado; traces em testes de score/world, supertiebreak e próximo set |
| R04: controlador/settings | `createController()` sem DOM/Canvas; browser possui adaptadores; descriptor único gera defaults/ciclo/rótulos/opções | Implementado; testes headless e PT/EN |
| R05: render/layout | `view/*`; configuração vem de `app/settings.js`; layouts compactos e acesso a tabelas | Implementado; geometria instrumentada e smoke Chromium com capturas inspecionadas |
| R06: integrador/geometria | kernel comum; contato radial da bola nas linhas e nos cantos da quadra e da caixa de saque | Implementado; testes compartilhados e deltas de física documentados |
| R07: IA | percepção/planner/claim/shot/executor; dono único, referência comum sem quique e diagnósticos limitados fora do RNG | Implementado; replays, exclusividade, logs e matriz antes/depois |
| R08: domínio/idioma | mensagens com códigos/params; domínio sem i18n; contratos JSDoc | Implementado; arquitetura e tradução na apresentação |
| R09: estatísticas | redutor síncrono, unidade/origem por métrica, fórmula legada de qualidade explicitada | Implementado; ponto único e total = histórico + set corrente |
| R10: parâmetros | perfis de shot, toss compartilhado, vigor e sprint compartilhados; defaults API/cliente explícitos; snapshots resolvidos | Implementado; testes de parâmetros e configuração exportável |
| R11: fronteiras | opções normalizadas, formatos 1/3/5 no placar, dt validado antes de mutar, clamps personalizados | Implementado; `config`, `phases`, `simulation-invariants` |
| R12: experimentos | runner/CLI estrito; schema/perfil/revisão/seed/protocolo; timeouts, distribuições, bootstrap por seed e cache de duplicatas | Implementado; matriz de 64 execuções/128 perspectivas e exemplo de três seeds |
| R13: regressões/CI | CI em qualquer base de PR, fixtures de estado e de inputs/eventos, helpers de teclado/replay, invariantes e assets | Implementado; workflow testa Node, valida PNG/SVG com Python padrão e executa Chromium |
| R14: assets/lifecycle | manifest/cache seletivo, diagnóstico de latência, boot com dois assets, demanda no desenho, falhas/retry/dispose; boot idempotente por canvas | Implementado; bytes/HTTP local medidos, assets desenhados em capturas Chromium; sem benchmark de decode/FPS/rede real |
| R15: suporte/UI | desktop com teclado, menu HTML/foco/transcrições, idioma do documento, silêncio | Implementado; foco, menu HTML e transcrições exercitados em Chromium; leitor de tela/teclado físico/áudio requerem aceitação humana |
| R16: docs/ferramentas | PLAN aponta à especificação e arquivo histórico; README/ajuda atuais; servidor público restrito e localhost | Implementado; auditoria, validação de assets e testes HTTP |

Nenhum teste fake foi tratado como inspeção visual. Também não foram
prometidos toque/gamepad, multiplayer, nova engine ou ajuste de equilíbrio.

## Medições e limitações

- Referência com inputs/eventos gerada diretamente no head #65, antes dos
  complementos; `input-replay.json` conserva script, dt, seed, estado e eventos.
- Métricas de gameplay e deltas de claim em `diagnostic-refactor.json`.
  Intervalos de uma seed são indisponíveis; três seeds continuam uma amostra pequena.
- Recursos atuais: política anterior iniciava 36 requisições, 4.914.961 bytes;
  boot atual inicia duas, 3.278.784 bytes. As outras ficam por demanda.
  `assets-measurement.json` registra cinco lotes HTTP em localhost. A comparação
  exclui decode/render, usa cache do sistema e ordem fixa; não é benchmark de
  carregamento no navegador ou numa rede real.
- Chromium não pôde ser instalado localmente: o CDN retornou HTTP 403.
  Essa restrição foi resolvida para a validação pelo job Chromium do GitHub
  Actions. O smoke executa os quatro modos, foco nativo, settings Q/E, todas
  as categorias, páginas de ajuda, pausa, resultado total/cinco sets,
  transcrições e dispose em PT/EN nos três viewports.
- As capturas reais revelaram cortes de rodapé e sobreposição em telas
  menores. As correções no PR 69 reservam 64 px ao menu HTML, quebram os
  textos, compactam títulos/linhas e ajustam o placar. O rodapé é limpo e
  o desenho fica limitado ao viewport para evitar resíduos da tela anterior.
  Os testes de geometria também cobrem a área efetiva sem rodapé, placar,
  pausa e resumo de set. A fixture visual de cinco sets não é uma partida
  de cinco sets jogada no navegador.

## Verificação manual restante

Execute `npm run serve` e confira em navegador desktop:

1. Leitor de tela real: Tab, foco visível, seleção de modo e transcrições
   de ajuda/resultados. Foco e conteúdo são verificados no Chromium, mas
   a interpretação por tecnologia assistiva precisa de avaliação humana.
2. Teclado físico e áudio real: dois jogadores, autoplay bloqueado,
   iniciar por interação, silêncio/reativação e desmontagem.
3. Imagens em rede lenta/falha no dispositivo alvo; latência de decode e
   FPS não foram medidos. O cache/fallback/retry tem regressões automatizadas,
   e as imagens prontas foram conferidas nas capturas do CI.

Esse checklist é validação de aceitação pendente, não pedido de nova
implementação fora do escopo.
