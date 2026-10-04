// Auditoria: confere se o que está documentado bate com o código e os testes.
// Uso: npm run audit:docs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COURT,
  CURVE,
  DIFFICULTY,
  MATCH,
  PHYS,
  PLAYER,
  SERVE,
  STAMINA,
  TURBO,
} from '../src/sim/constants.js';
import { LANG_ORDER } from '../src/i18n.js';
import { ICON_SOURCES } from '../src/icons.js';
import { CLASSES, CLASS_ORDER, STATS } from '../src/sim/stats.js';
import { pt } from '../src/lang/pt.js';
import { en } from '../src/lang/en.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const docs = {
  regras: read('docs/REGRAS.md'),
  impl: read('docs/IMPLEMENTACAO.md'),
  readme: read('README.md'),
  constants: read('src/sim/constants.js'),
  media: read('src/media.js'),
  i18n: read('src/i18n.js'),
  icons: read('src/icons.js'),
  stats: read('src/sim/stats.js'),
  render: read('src/render.js'),
  main: read('src/main.js'),
  world: read('src/sim/world.js'),
  ai: read('src/sim/ai.js'),
  physics: read('src/sim/physics.js'),
  score: read('src/sim/score.js'),
  tests: [
    'tests/score.test.js',
    'tests/physics.test.js',
    'tests/world.test.js',
    'tests/shots.test.js',
    'tests/serve.test.js',
    'tests/stamina.test.js',
    'tests/mechanics.test.js',
    'tests/controls.test.js',
    'tests/versus-ends.test.js',
    'tests/integration.test.js',
    'tests/human.test.js',
    'tests/render.test.js',
    'tests/client.test.js',
    'tests/i18n.test.js',
    'tests/icons.test.js',
    'tests/stats.test.js',
  ]
    .map(read)
    .join('\n'),
};

let ok = 0;
const fail = [];
const check = (name, cond, detail = '') => {
  if (cond) {
    ok++;
    return;
  }
  fail.push(`${name}${detail ? ` (${detail})` : ''}`);
};

// Constantes citadas na documentação
check('gravidade 10,5', PHYS.GRAVITY === 10.5, `código=${PHYS.GRAVITY}`);
check('arrasto 0,08', PHYS.AIR_DRAG === 0.08, `código=${PHYS.AIR_DRAG}`);
check('restituição 0,7', PHYS.BOUNCE_RESTITUTION === 0.7, `código=${PHYS.BOUNCE_RESTITUTION}`);
check(
  'quadra 23,77 x 10,97',
  COURT.HALF_LENGTH === 11.885 && COURT.DOUBLES_HALF_WIDTH === 5.485,
);
check('rede 0,914/1,07', COURT.NET_HEIGHT_CENTER === 0.914 && COURT.NET_HEIGHT_POST === 1.07);
check('toss 5,8 m/s em 0,52 s', SERVE.TOSS_VZ === 5.8 && SERVE.TOSS_TIME === 0.52);
check('vigor 45% (1,45)', STAMINA.SPEED_MULT === 1.45, `código=${STAMINA.SPEED_MULT}`);
check(
  'vigor corrida 32/s, carga 16/s, recarga 20/s, IA 0,6x',
  STAMINA.DRAIN === 32 &&
    STAMINA.CHARGE_DRAIN === 16 &&
    STAMINA.REGEN === 20 &&
    STAMINA.MIN_START === 12 &&
    STAMINA.AI_REGEN === 0.6,
);
check(
  'cansado abaixo de 25 (82% velocidade, 60% carga)',
  STAMINA.LOW === 25 && STAMINA.LOW_SPEED === 0.82 && STAMINA.LOW_CHARGE === 0.6,
);
check('pausas 2,2 / 3,4', MATCH.POINT_PAUSE === 2.2 && MATCH.SET_PAUSE === 3.4);
check('turbo 0,75 / 30', TURBO.THRESHOLD === 0.75 && TURBO.COST === 30);
check('alcance 1,25 / janela 0,24', PLAYER.REACH === 1.25 && PLAYER.SWING_ACTIVE === 0.24);
check('velocidade humana 5,4', PLAYER.MAX_SPEED === 5.4);
check(
  'IA 72/86/100/110/125%',
  DIFFICULTY.easy.speedMult === 0.72 &&
    DIFFICULTY.normal.speedMult === 0.86 &&
    DIFFICULTY.hard.speedMult === 1 &&
    DIFFICULTY.unfair.speedMult === 1.1 &&
    DIFFICULTY.impossible.speedMult === 1.25,
);
check('curva do slice 3,2 / 4,5', CURVE.SLICE_SHOT === 3.2 && CURVE.SLICE_SERVE === 4.5);
check(
  'i18n: pt e en com as mesmas chaves',
  LANG_ORDER.length === 2 &&
    Object.keys(pt).length > 100 &&
    JSON.stringify(Object.keys(pt).sort()) === JSON.stringify(Object.keys(en).sort()) &&
    /src\/lang\//.test(docs.i18n),
);
check(
  'i18n usado e documentado',
  /t\(/.test(docs.world) &&
    /t\(/.test(docs.render) &&
    /t\(/.test(docs.main) &&
    /i18n|Idioma/.test(docs.impl) &&
    /i18n|Idioma/.test(docs.readme),
);
check(
  'stats de 50 a 99 com 75 neutro',
  STATS.MIN === 50 && STATS.MAX === 99 && STATS.NEUTRAL === 75 && STATS.KEYS.length === 4,
);
check(
  '8 classes com stats na faixa',
  CLASS_ORDER.length === 8 &&
    CLASS_ORDER.every((id) =>
      STATS.KEYS.every((k) => CLASSES[id][k] >= STATS.MIN && CLASSES[id][k] <= STATS.MAX),
    ) &&
    /resolvePlayerStats/.test(docs.stats) &&
    /players: playerConfig/.test(docs.world),
);
check(
  'classes e stats traduzidas (pt/en)',
  CLASS_ORDER.every((id) => pt[`class.${id}`] && en[`class.${id}`]) &&
    ['random', 'custom'].every((id) => pt[`players.${id}`] && en[`players.${id}`]) &&
    STATS.KEYS.every((k) => pt[`stat.${k}`] && en[`stat.${k}`]) &&
    /classes e stats|Classes e stats/i.test(docs.readme) &&
    /Jogadores/.test(docs.regras),
);
check(
  'ícones de ação (assets/icons/vectors)',
  Object.keys(ICON_SOURCES).length >= 31 &&
    Object.values(ICON_SOURCES).every((src) => existsSync(join(ROOT, src))) &&
    /actionIcon/.test(docs.icons) &&
    /actionIcon/.test(docs.render) &&
    /ícones/i.test(docs.regras) &&
    /ícones/i.test(docs.readme),
);
check(
  'imagens de marca (assets/media)',
  /assets\/media/.test(docs.media) &&
    /assets\/media/.test(docs.impl) &&
    /assets\/media/.test(docs.readme),
);

// Regras citadas na documentação: doc + código + testes
const rules = [
  ['deuce/AD', /deuce/i, /isDeuce|advantageTeam/, /deuce/i],
  ['tiebreak 1-2-2-2', /tiebreak/i, /serviceTeamForPoint/, /tiebreak/i],
  ['dupla falta', /dupla falta/i, /registerFault/, /dupla falta|DUPLA FALTA/i],
  ['let', /\blet\b/i, /replayServe/, /let/i],
  ['devolução do recebedor', /recebedor designado/i, /returnPending/, /recebedor/i],
  ['golpes fundamentais', /Golpes fundamentais/, /situation/, /situation|voleio|smash/i],
  ['vigor', /Vigor \(stamina\)/, /STAMINA\./, /vigor/i],
  [
    'vigor de carga',
    /carregar a batida também gasta|carregar por 1 s custa/i,
    /CHARGE_DRAIN/,
    /CHARGE_DRAIN|segurar a batida gasta/i,
  ],
  ['cansado', /Cansado|abaixo de 25/, /tired|LOW_SPEED/, /cansado/i],
  ['idioma (i18n)', /i18n|Idioma/, /setLang|LANG_ORDER|export function t/, /setLang|i18n|Idioma/i],
  [
    'classes e stats',
    /Classes e stats|8 classes/i,
    /resolvePlayerStats|powerMul/,
    /classId|CLASSES|classe/i,
  ],
  ['tela de carregamento', /carregamento/i, /drawLoading/, /drawLoading|CARREGANDO/i],
  [
    'ícones de ação',
    /selo|ícones de ação/i,
    /actionIcon|handVariant/,
    /forehand usa \+|actionIconName|selo/i,
  ],
  ['sprint da IA', /IA também corre|sprint/i, /input\.sprint/, /sprint/i],
  ['colisão entre jogadores', /Entre jogadores/, /resolvePlayerCollisions/, /companheiros/i],
  ['bola no parceiro', /BATEU NO PARCEIRO/, /BATEU NO PARCEIRO/, /PARCEIRO/],
  [
    'pausa com movimentação',
    /movimentação continua liberada/,
    /phase === 'pointover'/,
    /movimentação continua/i,
  ],
  ['troca de lado', /troca de lado a cada game ímpar/i, /changeEnds/, /troca de lado/i],
  ['saque com tipos', /Top spin \(kick\)/, /executeServe/, /tipos de saque/i],
  ['forehand/backhand', /Forehand/, /hand =/, /forehand/i],
  ['turbo', /Turbo/, /TURBO\.THRESHOLD/, /turbo/i],
  ['efeito lateral do slice', /efeito lateral/i, /curve/, /curva|slice/i],
  ['dificuldade Injusto', /Injusto/, /unfair/, /unfair|Injusto/i],
  ['dificuldade Impossível', /Impossível/, /impossible/, /impossible|Impossível/i],
];
for (const [name, docRe, codeRe, testRe] of rules) {
  const inDoc = docRe.test(docs.regras) || docRe.test(docs.impl) || docRe.test(docs.readme);
  const inCode =
    codeRe.test(docs.stats) ||
    codeRe.test(docs.icons) ||
    codeRe.test(docs.constants) ||
    codeRe.test(docs.world) ||
    codeRe.test(docs.ai) ||
    codeRe.test(docs.physics) ||
    codeRe.test(docs.score) ||
    codeRe.test(docs.i18n) ||
    codeRe.test(docs.render) ||
    codeRe.test(docs.main);
  const inTests = testRe.test(docs.tests);
  check(`regra "${name}"`, inDoc && inCode && inTests, `doc=${inDoc} código=${inCode} testes=${inTests}`);
}

console.log(`Auditoria: ${ok} verificações OK, ${fail.length} pendências`);
for (const f of fail) console.log('  PENDÊNCIA:', f);
if (fail.length) process.exitCode = 1;
