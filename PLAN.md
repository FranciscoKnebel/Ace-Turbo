# Ace Turbo: plano e referências atuais

O plano original de implementação, com seus registros de mudanças, foi
preservado em [arquivo histórico](docs/archive/PLANO-ORIGINAL.md).
Ele não é a especificação atual do jogo.

| Documento | Uso |
|---|---|
| [README](README.md) | Executar o jogo, controles e suporte a desktop com teclado |
| [Regras](docs/REGRAS.md) | Regras e decisões de gameplay atuais |
| [Implementação](docs/IMPLEMENTACAO.md) | Arquitetura, contratos e operação |
| [Validação](docs/VALIDACAO-REFATORACAO.md) | Replays, medições e limitações |
| [Cobertura do plano](docs/COBERTURA-REFATORACAO.md) | Critérios B01–B09/R01–R16, evidências e pendências |

A refatoração preserva Canvas, módulos ES e execução da simulação no Node.
Os complementos após o PR 65 concluem os critérios que faltavam na primeira
pilha. Inspeção visual, áudio e teclado em navegador real têm status separado
da validação automatizada; não foram considerados concluídos por testes fake.
Mobile/gamepad, multiplayer, nova engine e recalibração de classes continuam
fora do escopo desta refatoração.
