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
import { CLASSES, CLASS_ORDER, CLASS_TRAITS, STATS } from '../src/sim/stats.js';
import { SURFACES, SURFACE_ORDER, WEATHERS, WEATHER_ORDER, WIND } from '../src/sim/constants.js';
import { pt } from '../src/lang/pt.js';
import { en } from '../src/lang/en.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readOptional = (p) => {
  try {
    return readFileSync(join(ROOT, p), 'utf8');
  } catch {
    return '';
  }
};
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
check(
  'saque em 2 estágios (toss 4,8 a 7,6 m/s, zona ideal 0,6 a 0,9)',
  SERVE.TOSS_VZ_MIN === 4.8 &&
    SERVE.TOSS_VZ_MAX === 7.6 &&
    SERVE.TOSS_IDEAL_MIN === 0.6 &&
    SERVE.TOSS_IDEAL_MAX === 0.9 &&
    SERVE.HIT_MIN_Z > 0 &&
    /tossQuality/.test(docs.world),
);
check(
  'toss com área de 100% que cresce com o saque',
  SERVE.TOSS_PERFECT_MIN > 0 &&
    SERVE.TOSS_PERFECT_MAX > SERVE.TOSS_PERFECT_MIN &&
    /tossQuality\(charge, serveStat/.test(docs.world),
);
check(
  'recebedor preso atrás da linha de saque',
  /SERVICE_LINE/.test(docs.world) &&
    /receiverId/.test(docs.world) &&
    /atrás da linha de saque|caixa de serviço/i.test(docs.regras),
);
check(
  'batida na queda (subida punida)',
  SERVE.CONTACT_IDEAL === 0.88 &&
    SERVE.RISE_PENALTY > 0 &&
    SERVE.RISE_PENALTY < 1 &&
    /contactVz/.test(docs.world) &&
    /ball\.vz < 0/.test(docs.ai),
);
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
check(
  'superfícies (duro, saibro e grama)',
  SURFACE_ORDER.length === 3 &&
    SURFACES.hard.bounce === 1 &&
    SURFACES.clay.bounce > 1 &&
    SURFACES.grass.bounce < 1 &&
    SURFACES.grass.keep > 1 &&
    SURFACES.clay.keep < 1 &&
    /surfaceOf/.test(docs.physics) &&
    /drawCourt\(ctx, v, world\.surface\)/.test(docs.render) &&
    /Quadra/.test(docs.regras) &&
    /Saibro/.test(docs.readme),
);
check(
  'clima (noite, dia, ventania e aleatório)',
  WEATHER_ORDER.length === 4 &&
    WEATHERS.night.wind === 0 &&
    WEATHERS.windy.wind === 1 &&
    WIND.MIN > 0 &&
    WIND.MAX > WIND.MIN &&
    /ball\.wind/.test(docs.physics) &&
    /WIND\.COMPENSATION/.test(docs.world) &&
    /resolveWeather/.test(docs.world) &&
    /drawWeatherBadge/.test(docs.render) &&
    /Ventania/.test(docs.regras),
);
check(
  'publicação no GitHub Pages',
  /deploy-pages/.test(readOptional('.github/workflows/pages.yml')) &&
    /_site/.test(readOptional('.github/workflows/pages.yml')) &&
    /GitHub Pages/.test(docs.readme),
);
check(
  'pausa entre pontos recupera 10% a 25% da barra',
  STAMINA.PAUSE_REGEN_MIN === 0.1 &&
    STAMINA.PAUSE_REGEN_MAX === 0.25 &&
    /pauseDuration/.test(docs.world) &&
    /PAUSE_REGEN/.test(docs.impl),
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
  'traços de IA por classe (rede/profundidade/agressividade)',
  CLASS_ORDER.every(
    (id) =>
      CLASS_TRAITS[id] &&
      CLASS_TRAITS[id].net >= 0 &&
      CLASS_TRAITS[id].net <= 1 &&
      CLASS_TRAITS[id].depth >= -1 &&
      CLASS_TRAITS[id].depth <= 1 &&
      CLASS_TRAITS[id].aggression >= 0 &&
      CLASS_TRAITS[id].aggression <= 1,
  ) &&
    /CLASS_TRAITS/.test(docs.stats) &&
    /traits/.test(docs.world) &&
    /homeSpot/.test(docs.ai),
);
check(
  'segundo quique e cerca longe',
  PHYS.FENCE_Y >= 18 &&
    /resolveRallyEnd/.test(docs.world) &&
    /checkBallStopped/.test(docs.world) &&
    /segundo quique/i.test(docs.regras),
);
check(
  'estatísticas por set e ace',
  /setHistory/.test(docs.world) &&
    /setSummary/.test(docs.render) &&
    /makeStats/.test(docs.world) &&
    pt['reason.ace'] &&
    en['reason.ace'],
);
check('carregamento de 5 s', /duration: 5\.0/.test(docs.main));
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
    'segundo quique',
    /segundo quique/i,
    /resolveRallyEnd/,
    /segundo quique|DUAS VEZES|checkBallStopped/i,
  ],
  ['ace', /ACE/, /'ACE'/, /reason.*ACE|'ACE'|ACE/],
  [
    'parceiro não persegue o saque',
    /não corre atrás|não persegue/i,
    /returnPending/,
    /parceiro.*não persegue|não persegue|interceptação/i,
  ],
  ['estatísticas por set', /por set|fim de cada set/i, /setHistory/, /setHistory|setSummary/],
  ['traços de classe', /traços/i, /CLASS_TRAITS/, /homeSpot|chooseShot/],
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
  [
    'golpes só em jogo',
    /golpes? e carga só valem nas fases|serve.*rally/i,
    /phase !== 'serve' && world.phase !== 'rally'/,
    /swing ativo não cancela|não há carga nem gasto/i,
  ],
  [
    'falta restaura a formação',
    /posições de saque são restauradas|volta(m)? para a formação/i,
    /replayServe/,
    /replayServe|formação/i,
  ],
  [
    'saque em dois estágios',
    /dois estágios/i,
    /tossQuality|startServeToss/,
    /tossQuality|dois estágios|TOSS PERFEITO/i,
  ],
  ['power no lugar do lob no saque', /Power/, /'power'/, /power/i],
  [
    'ícone do power diferente do flat',
    /selo \+/,
    /serve-flat-plus/,
    /serve-flat-plus/,
  ],
  [
    'área de 100% do toss',
    /área interna|100%/i,
    /TOSS_PERFECT/,
    /TOSS_PERFECT|tossQuality/i,
  ],
  ['classe aleatória da CPU', /Aleatória/, /classId: 'random'/, /sorteia a classe/i],
  [
    'vento muda a bola',
    /ventania|vento aplica/i,
    /ball\.wind|wind\.x \* dt/,
    /vento/i,
  ],
  [
    'superfícies mudam o quique',
    /Saibro.*alto|quique mais alto/i,
    /SURFACES\.clay|surfaceOf/,
    /superfície|Saibro/i,
  ],
  [
    'recepção espera na linha de fundo',
    /linha de fundo|baseline/i,
    /deepPick|homeY/,
    /deepPick|recepção|baseline/i,
  ],
  [
    'IA só carrega se alcança',
    /inalcançável|canReach|alcança/i,
    /canReach/,
    /canReach|inalcançável/i,
  ],
  [
    'batida na queda',
    /na queda|subida é punid/i,
    /RISE_PENALTY|contactVz/,
    /contactVz|subida|na queda/i,
  ],
  ['forehand/backhand', /Forehand/, /hand =/, /forehand/i],
  ['neutro punido', /neutro|corpo/i, /errMag \*= 1\.45|0\.86/, /neutro|corpo/i],
  [
    'IA abre para o forehand',
    /abre (o|para o) forehand/i,
    /FOREHAND_OFFSET/,
    /FOREHAND_OFFSET|forehand/i,
  ],
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
