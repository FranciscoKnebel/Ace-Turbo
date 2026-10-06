import { createWorld, stepWorld } from './sim/world.js';
import { createKeyboard, pumpHumanInputs } from './input.js';
import {
  computeView,
  drawHelp,
  drawLoading,
  drawMatch,
  drawMenu,
  drawPause,
  drawPlayers,
  drawSettings,
  menuRows,
  settingRow,
  SETTINGS_CATEGORIES,
  modeSlots,
  slotConfig,
  BEST_OF_ORDER,
  DIFFICULTY_ORDER,
  FINAL_SET_ORDER,
  SCORING_ORDER,
  MODE_ORDER,
} from './render.js';
import { SURFACE_ORDER, WEATHER_ORDER } from './sim/constants.js';
import { CLASSES, CONFIG_KEYS, STATS, clampStat } from './sim/stats.js';
import { createAudio } from './audio.js';
import { loadMedia } from './media.js';
import { detectLang, LANG_ORDER, setLang, t } from './i18n.js';
import { loadIcons } from './icons.js';

const DT = 1 / 120;

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

export function boot() {
  loadMedia();
  loadIcons();
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const keyboard = createKeyboard(window);
  const audio = createAudio();

  const menu = {
    modeIndex: 0,
    difficultyIndex: 0,
    bestOfIndex: 0,
    finalSetIndex: 0,
    scoringIndex: 0,
    surfaceIndex: 0,
    weatherIndex: 0,
    langIndex: Math.max(0, LANG_ORDER.indexOf(detectLang())),
    focus: 0,
    // Configuração de classes/stats por slot (vazio = padrão: humano
    // equilibrado, CPU com classe aleatória a cada partida).
    players: { focus: 0, selected: 0, config: {} },
    settings: { category: 0, focus: 0 },
  }; // Fácil + 1 set + idioma do navegador
  const loading = { t: 0, duration: 5.0 };
  setLang(LANG_ORDER[menu.langIndex]);
  let screen = 'menu';
  let world = null;
  let paused = false;
  const fx = { trail: [], marks: [], impacts: [], labels: [], shake: 0 };
  let last = performance.now();
  let acc = 0;
  let view = computeView(window.innerWidth, window.innerHeight);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = computeView(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  function difficulty() {
    return DIFFICULTY_ORDER[menu.difficultyIndex];
  }

  function cycleLang(delta) {
    menu.langIndex = (menu.langIndex + delta + LANG_ORDER.length) % LANG_ORDER.length;
    setLang(LANG_ORDER[menu.langIndex]);
    audio.menu();
  }

  // Valor de uma configuração (usado no menu e na tela de Configurações).
  function cycleSetting(kind, delta, menuState) {
    if (kind === 'difficulty') {
      menuState.difficultyIndex =
        (menuState.difficultyIndex + delta + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length;
    } else if (kind === 'bestOf') {
      menuState.bestOfIndex =
        (menuState.bestOfIndex + delta + BEST_OF_ORDER.length) % BEST_OF_ORDER.length;
    } else if (kind === 'finalSet') {
      menuState.finalSetIndex =
        (menuState.finalSetIndex + delta + FINAL_SET_ORDER.length) % FINAL_SET_ORDER.length;
    } else if (kind === 'scoring') {
      menuState.scoringIndex =
        (menuState.scoringIndex + delta + SCORING_ORDER.length) % SCORING_ORDER.length;
    } else if (kind === 'language') {
      cycleLang(delta);
      return;
    } else if (kind === 'surface') {
      menuState.surfaceIndex =
        (menuState.surfaceIndex + delta + SURFACE_ORDER.length) % SURFACE_ORDER.length;
    } else if (kind === 'weather') {
      menuState.weatherIndex =
        (menuState.weatherIndex + delta + WEATHER_ORDER.length) % WEATHER_ORDER.length;
    } else {
      return;
    }
    audio.menu();
  }

  function startMatch() {
    const mode = MODE_ORDER[menu.modeIndex];
    world = createWorld({
      mode,
      difficulty: difficulty(),
      bestOf: BEST_OF_ORDER[menu.bestOfIndex],
      superTiebreak: (menu.finalSetIndex ?? 0) === 1,
      noAd: (menu.scoringIndex ?? 0) === 1,
      surface: SURFACE_ORDER[menu.surfaceIndex] ?? 'hard',
      weather: WEATHER_ORDER[menu.weatherIndex] ?? 'night',
      seed: (Date.now() % 100000) + 1,
      players: menu.players.config,
    });
    fx.trail.length = 0;
    fx.marks.length = 0;
    fx.impacts.length = 0;
    fx.labels.length = 0;
    fx.shake = 0;
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
          menu.modeIndex = (menu.modeIndex + delta + MODE_ORDER.length) % MODE_ORDER.length;
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
        } else startMatch();
      }
      return;
    }
    if (k.wasPressed('KeyP') || k.wasPressed('Escape')) paused = !paused;
    if (k.wasPressed('KeyR')) startMatch();
    if (k.wasPressed('KeyM')) {
      screen = 'menu';
      paused = false;
    }
    if (paused && (k.wasPressed('Enter') || k.wasPressed('Space'))) paused = false;
  }

  function render() {
    if (screen === 'menu') {
      drawMenu(ctx, view, menu);
      return;
    }
    if (screen === 'settings') {
      drawSettings(ctx, view, menu);
      return;
    }
    if (screen === 'help') {
      drawHelp(ctx, view);
      return;
    }
    if (screen === 'players') {
      drawPlayers(ctx, view, menu);
      return;
    }
    if (screen === 'loading') {
      drawLoading(ctx, view, world, menu, Math.min(1, loading.t / loading.duration));
      return;
    }
    drawMatch(ctx, world, view, fx);
    if (paused) drawPause(ctx, view);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    handleKeys();

    if (screen === 'loading') {
      loading.t += dt;
      if (loading.t >= loading.duration) {
        loading.t = loading.duration;
        screen = 'playing';
      }
    }

    if (screen === 'playing' && !paused) {
      pumpHumanInputs(keyboard, world);
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 20) {
        stepWorld(world, DT);
        handleEvents();
        acc -= DT;
        steps++;
      }
      if (acc > DT * 20) acc = 0;
      updateFx(dt);
    } else {
      acc = 0;
    }

    render();
    keyboard.endFrame();
    requestAnimationFrame(frame);
  }

  window.addEventListener('blur', () => {
    if (screen === 'playing') paused = true;
  });

  resize();
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof requestAnimationFrame === 'function') {
  boot();
}
