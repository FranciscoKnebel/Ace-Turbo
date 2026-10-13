import { menuRows, settingRow, SETTINGS_CATEGORIES, modeSlots, slotConfig, MODE_ORDER, createMenu, cycleMenuSetting } from './menu.js';
import { matchOptionsFor, readSetting } from './settings.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { CLASSES, CONFIG_KEYS, STATS, clampStat } from '../sim/stats.js';
import { t } from '../i18n.js';
// O kick do saque é o "topspin" no input, mas o ícone se chama serve-kick.
export const serveIcon = (shot) => {
  if (shot === 'topspin') return 'serve-kick';
  if (shot === 'power') return 'serve-flat-plus'; // força: flat com selo +
  return `serve-${shot ?? 'flat'}`;
};

const SHOT_RGB = {
  flat: '248,250,252',
  topspin: '253,224,71',
  slice: '125,211,252',
  lob: '251,146,60',
  serve: '253,224,71',
};


const SILENT_AUDIO = Object.fromEntries(['setMuted','menu','start','smash','volley','slice','lob','hit','turbo','serve','bounce','net','point'].map(key=>[key,()=>{}]));
/** Application state/ticks without DOM, Canvas, RAF or platform listeners. */
export function createController({ keyboard = {clear(){},wasPressed(){return false;}}, audio = SILENT_AUDIO,
  readInputs = () => {}, now = Date.now, onLanguage = () => {}, menu = createMenu({language:'pt'}) } = {}) {
  const DT=1/120, loading={t:0,duration:5};
  let screen='menu', helpPage=0, helpPages=1, world=null, paused=false, acc=0, disposed=false;
  const fx={trail:[],marks:[],impacts:[],labels:[],shake:0};
  function cycleSetting(kind, delta, menuState) {
    if (!cycleMenuSetting(menuState, kind, delta)) return;
    if (kind === 'audio') audio.setMuted(menuState.muted);
    if (kind === 'language') onLanguage(readSetting(menuState, 'language'));
    audio.menu();
  }

  function startMatch() {
    keyboard.clear();
    world = createWorld(matchOptionsFor(menu, (now() % 100000) + 1));
    fx.trail.length = 0;
    fx.marks.length = 0;
    fx.impacts.length = 0;
    fx.labels.length = 0;
    fx.shake = 0;
    fx.summaryPage = 0;
    acc = 0;
    paused = false;
    // Antes de jogar, a tela de carregamento mostra modo, formato e jogadores.
    loading.t = 0;
    screen = 'loading';
    audio.start();
  }

  function handleEvents() {
    for (const ev of world.events) {
      if (ev.type === 'hit') {
        const rgb = SHOT_RGB[ev.shot] ?? SHOT_RGB.flat;
        if (ev.situation === 'smash') audio.smash();
        else if (ev.situation === 'voleio') audio.volley();
        else if (ev.shot === 'slice') audio.slice();
        else if (ev.shot === 'lob') audio.lob();
        else audio.hit();
        if (ev.turbo) {
          audio.turbo();
          fx.shake = 7;
        }
        fx.trail.push({
          x: world.ball.x,
          y: world.ball.y,
          z: world.ball.z,
          life: 0.3,
          max: 0.3,
          rgb,
        });
        fx.impacts.push({
          x: world.ball.x,
          y: world.ball.y,
          z: Math.max(0.3, world.ball.z),
          life: 0.28,
          max: 0.28,
          rgb,
        });
        const hand = ev.hand && ev.hand !== 'neutral' ? t(`hand.${ev.hand}`) : '';
        const special =
          ev.situation && ev.situation !== 'fundo' ? t(`situation.${ev.situation}`) : '';
        const shotName = t(`shot.${ev.shot ?? 'flat'}`);
        const text = special
          ? `${special}${hand ? ` • ${hand}` : ''}`
          : `${shotName}${hand ? ` • ${hand}` : ''}`;
        fx.labels.push({
          playerId: ev.player,
          action: `shot-${ev.shot ?? 'flat'}`,
          hand: ev.hand ?? 'neutral',
          turbo: !!ev.turbo,
          caption: special,
          text,
          life: 0.7,
          max: 0.7,
          rgb,
        });
      } else if (ev.type === 'serve') {
        audio.serve();
        // O saque também aparece como ícone (serve-*) na tela.
        fx.labels.push({
          playerId: ev.player,
          action: serveIcon(ev.shot),
          hand: 'neutral',
          turbo: false,
          caption: '',
          text: t(`shot.${ev.shot ?? 'flat'}`),
          life: 0.7,
          max: 0.7,
          rgb: SHOT_RGB[ev.shot] ?? SHOT_RGB.flat,
        });
      } else if (ev.type === 'ball_bounce') {
        audio.bounce();
        fx.marks.push({ x: ev.x, y: ev.y, life: 0.5, max: 0.5 });
      } else if (ev.type === 'ball_net') {
        audio.net();
      } else if (ev.type === 'point') {
        audio.point();
        if (ev.matchWon) fx.shake = 10;
      }
    }
  }

  function updateFx(dt) {
    for (const t of fx.trail) t.life -= dt;
    fx.trail = fx.trail.filter((t) => t.life > 0);
    for (const m of fx.marks) m.life -= dt;
    fx.marks = fx.marks.filter((m) => m.life > 0);
    for (const im of fx.impacts) im.life -= dt;
    fx.impacts = fx.impacts.filter((im) => im.life > 0);
    for (const lb of fx.labels) lb.life -= dt;
    fx.labels = fx.labels.filter((lb) => lb.life > 0);
    fx.shake = Math.max(0, fx.shake - dt * 22);
  }

  function handleKeys() {
    const k = keyboard;
    if (screen === 'help') {
      if (k.wasPressed('ArrowRight') || k.wasPressed('PageDown')) helpPage = (helpPage + 1) % helpPages;
      if (k.wasPressed('ArrowLeft') || k.wasPressed('PageUp')) helpPage = (helpPage + helpPages - 1) % helpPages;
      if (
        k.wasPressed('Escape') ||
        k.wasPressed('Enter') ||
        k.wasPressed('Space') ||
        k.wasPressed('KeyM')
      ) {
        screen = 'menu';
        audio.menu();
      }
      return;
    }
    if (screen === 'players') {
      const slots = modeSlots(MODE_ORDER[menu.modeIndex]);
      const total = slots.length + STATS.KEYS.length;
      const move = (d) => {
        menu.players.focus = (menu.players.focus + d + total) % total;
        if (menu.players.focus < slots.length) menu.players.selected = menu.players.focus;
        audio.menu();
      };
      if (k.wasPressed('ArrowUp')) move(-1);
      if (k.wasPressed('ArrowDown')) move(1);
      const big = k.wasPressed('KeyE') || k.wasPressed('KeyQ');
      const delta =
        k.wasPressed('ArrowRight') || k.wasPressed('KeyE')
          ? 1
          : k.wasPressed('ArrowLeft') || k.wasPressed('KeyQ')
            ? -1
            : 0;
      if (delta !== 0) {
        const focus = menu.players.focus;
        if (focus < slots.length) {
          // No jogador: troca a classe (preset) com as setas ou Q/E.
          const slot = slots[focus];
          menu.players.selected = focus;
          const cfg = slotConfig(menu, slot);
          const options = CONFIG_KEYS.filter((c) => c !== 'custom');
          const idx = Math.max(0, options.indexOf(cfg.classId));
          menu.players.config[slot.id] = {
            classId: options[(idx + delta + options.length) % options.length],
          };
        } else {
          // Nas stats: ajusta em 1 (setas) ou 5 (Q/E) e vira personalizado.
          const key = STATS.KEYS[focus - slots.length];
          const slot = slots[Math.min(menu.players.selected, slots.length - 1)];
          const cfg = slotConfig(menu, slot);
          const base =
            cfg.classId === 'custom' && cfg.stats
              ? cfg.stats
              : (CLASSES[cfg.classId] ?? CLASSES.balanced);
          const stats = { ...base, [key]: clampStat(base[key] + delta * (big ? 5 : 1)) };
          menu.players.config[slot.id] = { classId: 'custom', stats };
        }
        audio.menu();
      }
      if (k.wasPressed('Escape') || k.wasPressed('Enter') || k.wasPressed('KeyM')) {
        screen = 'menu';
        audio.menu();
      }
      return;
    }
    if (screen === 'loading') {
      if (k.wasPressed('Enter') || k.wasPressed('Space') || k.wasPressed('Escape')) {
        screen = 'playing';
        keyboard.clear();
      }
      if (k.wasPressed('KeyM')) screen = 'menu';
      return;
    }
    if (screen === 'settings') {
      const cats = SETTINGS_CATEGORIES;
      const cat = Math.min(menu.settings.category, cats.length - 1);
      const rows = cats[cat].rows.map((kind) => settingRow(kind, menu)).filter(Boolean);
      const total = rows.length;
      const d = k.wasPressed('ArrowDown') ? 1 : k.wasPressed('ArrowUp') ? -1 : 0;
      if (d !== 0 && total) {
        menu.settings.focus = (menu.settings.focus + d + total) % total;
        audio.menu();
      }
      const cd = k.wasPressed('ArrowRight') ? 1 : k.wasPressed('ArrowLeft') ? -1 : 0;
      if (cd !== 0) {
        menu.settings.category = (menu.settings.category + cd + cats.length) % cats.length;
        menu.settings.focus = 0;
        audio.menu();
      }
      const vd = k.wasPressed('KeyE') ? 1 : k.wasPressed('KeyQ') ? -1 : 0;
      if (vd !== 0 && total) {
        cycleSetting(rows[menu.settings.focus]?.kind, vd, menu);
      }
      if (k.wasPressed('Enter') || k.wasPressed('Escape')) screen = 'menu';
      return;
    }
    if (screen === 'menu') {
      const rows = menuRows(menu);
      const total = rows.length;
      if (k.wasPressed('ArrowUp')) {
        menu.focus = (menu.focus + total - 1) % total;
        audio.menu();
      }
      if (k.wasPressed('ArrowDown')) {
        menu.focus = (menu.focus + 1) % total;
        audio.menu();
      }
      // Setas laterais selecionam o modo (nos demais itens, Q/E altera).
      if (k.wasPressed('ArrowLeft') || k.wasPressed('ArrowRight')) {
        const row = rows[menu.focus] ?? rows[0];
        if (row.kind === 'mode') {
          const delta = k.wasPressed('ArrowRight') ? 1 : -1;
          menu.modeIndex = (MODE_ORDER.indexOf(row.modeId) + delta + MODE_ORDER.length) % MODE_ORDER.length;
          menu.focus = menu.modeIndex;
          audio.menu();
        }
      }
      // Números: 1 a 9 selecionam as primeiras linhas (o teclado só emite
      // Digit0 a Digit9; as linhas seguintes ficam sem atalho).
      const shortcuts = Math.min(rows.length, 9);
      for (let i = 0; i < shortcuts; i++) {
        if (k.wasPressed(`Digit${i + 1}`)) {
          menu.focus = i;
          if (rows[i].kind === 'mode') menu.modeIndex = i;
          audio.menu();
        }
      }
      // Q/E altera a configuração da linha (quando ela cicla valor).
      const delta = k.wasPressed('KeyE') ? 1 : k.wasPressed('KeyQ') ? -1 : 0;
      if (delta !== 0) {
        const row = rows[menu.focus] ?? rows[0];
        cycleSetting(row.kind, delta, menu);
      }
      if (k.wasPressed('Enter') || k.wasPressed('Space')) {
        const row = rows[menu.focus] ?? rows[0];
        if (row.kind === 'help') screen = 'help';
        else if (row.kind === 'players') {
          screen = 'players';
          menu.players.focus = 0;
          menu.players.selected = 0;
        } else if (row.kind === 'settings') {
          screen = 'settings';
          menu.settings.focus = 0;
        } else {
          menu.modeIndex = MODE_ORDER.indexOf(row.modeId);
          startMatch();
        }
      }
      return;
    }
    if (world?.phase === 'matchover') {
      if (k.wasPressed('ArrowRight')) fx.summaryPage = (fx.summaryPage ?? 0) + 1;
      if (k.wasPressed('ArrowLeft')) fx.summaryPage = (fx.summaryPage ?? 0) - 1;
    }
    if (k.wasPressed('KeyP') || k.wasPressed('Escape')) { paused = !paused; k.clearTransitions(); }
    if (k.wasPressed('KeyR')) startMatch();
    if (k.wasPressed('KeyM')) {
      screen = 'menu';
      paused = false;
    }
    if (paused && (k.wasPressed('Enter') || k.wasPressed('Space'))) { paused = false; k.clearTransitions(); }
  }


  const actions = {
    start:startMatch,
    menu:()=>{screen='menu';paused=false;keyboard.clear();},
    help:()=>{screen='help';helpPage=0;keyboard.clear();},
    players:()=>{screen='players';menu.players.focus=0;menu.players.selected=0;keyboard.clear();},
    settings:()=>{screen='settings';menu.settings.focus=0;keyboard.clear();},
    pause:()=>{if(screen==='playing')paused=!paused;keyboard.clear();},
    blur:()=>{if(screen==='playing'){paused=true;keyboard.clear();}},
    mode:value=>{const index=MODE_ORDER.indexOf(value);if(index>=0)menu.modeIndex=menu.focus=index;},
    mute:()=>{menu.muted=!menu.muted;audio.setMuted(menu.muted);},
  };
  return {
    actions,
    getState:()=>({screen,paused,menu,world,fx,loading,helpPage}),
    setHelpPages:n=>{helpPages=Math.max(1,n);helpPage%=helpPages;},
    advance(dt) {
      if(disposed)return;
      if(!Number.isFinite(dt)||dt<0||dt>.05)throw new RangeError('Frame duration must be in [0, 0.05]');
      handleKeys();
      if(screen==='loading') {
        loading.t=Math.min(loading.duration,loading.t+dt);
        if(loading.t>=loading.duration){screen='playing';keyboard.clear();}
      }
      if(screen==='playing'&&!paused) {
        acc+=dt; let steps=0;
        while(acc>=DT&&steps<20){readInputs(keyboard,world);stepWorld(world,DT);handleEvents();acc-=DT;steps++;}
        if(acc>DT*20)acc=0; updateFx(dt);
      }else acc=0;
    },
    dispose:()=>{disposed=true;},
  };
}
