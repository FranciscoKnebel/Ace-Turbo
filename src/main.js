import { createWorld, stepWorld } from './sim/world.js';
import { createKeyboard, pumpHumanInputs } from './input.js';
import {
  computeView,
  drawMatch,
  drawMenu,
  drawPause,
  BEST_OF_ORDER,
  DIFFICULTY_ORDER,
  MODE_ORDER,
} from './render.js';
import { createAudio } from './audio.js';

const DT = 1 / 120;

export function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const keyboard = createKeyboard(window);
  const audio = createAudio();

  const menu = { modeIndex: 0, difficultyIndex: 0, bestOfIndex: 0 }; // Fácil + 1 set
  let screen = 'menu';
  let world = null;
  let paused = false;
  const fx = { trail: [], marks: [], shake: 0 };
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

  function startMatch() {
    const mode = MODE_ORDER[menu.modeIndex];
    world = createWorld({
      mode,
      difficulty: difficulty(),
      bestOf: BEST_OF_ORDER[menu.bestOfIndex],
      seed: (Date.now() % 100000) + 1,
    });
    fx.trail.length = 0;
    fx.marks.length = 0;
    fx.shake = 0;
    acc = 0;
    paused = false;
    screen = 'playing';
    audio.start();
  }

  function handleEvents() {
    for (const ev of world.events) {
      if (ev.type === 'hit') {
        audio.hit();
        if (ev.turbo) {
          audio.turbo();
          fx.shake = 7;
        }
        fx.trail.push({ x: world.ball.x, y: world.ball.y, z: world.ball.z, life: 0.3, max: 0.3 });
      } else if (ev.type === 'serve') {
        audio.serve();
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
    fx.shake = Math.max(0, fx.shake - dt * 22);
  }

  function handleKeys() {
    const k = keyboard;
    if (screen === 'menu') {
      if (k.wasPressed('Digit1')) menu.modeIndex = 0;
      if (k.wasPressed('Digit2')) menu.modeIndex = 1;
      if (k.wasPressed('Digit3')) menu.modeIndex = 2;
      if (k.wasPressed('Digit4')) menu.modeIndex = 3;
      if (k.wasPressed('ArrowUp') || k.wasPressed('KeyW')) {
        menu.modeIndex = (menu.modeIndex + MODE_ORDER.length - 1) % MODE_ORDER.length;
        audio.menu();
      }
      if (k.wasPressed('ArrowDown') || k.wasPressed('KeyS')) {
        menu.modeIndex = (menu.modeIndex + 1) % MODE_ORDER.length;
        audio.menu();
      }
      if (k.wasPressed('KeyD')) {
        menu.difficultyIndex = (menu.difficultyIndex + 1) % DIFFICULTY_ORDER.length;
        audio.menu();
      }
      if (k.wasPressed('KeyS')) {
        menu.bestOfIndex = (menu.bestOfIndex + 1) % BEST_OF_ORDER.length;
        audio.menu();
      }
      if (k.wasPressed('Enter') || k.wasPressed('Space')) startMatch();
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
    drawMatch(ctx, world, view, fx);
    if (paused) drawPause(ctx, view);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    handleKeys();

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
