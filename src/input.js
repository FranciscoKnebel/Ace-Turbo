import { blankInput } from './sim/ai.js';

// Mapa de teclas por "slot" de jogador: 1 = P1 (te a), 2 = P2 (te a2 ou b1).
// Cada jogador tem 4 teclas de batida: flat (padrão), top spin, slice e lob.
const MAPS = {
  1: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    flat: 'Space',
    topspin: 'KeyJ',
    slice: 'KeyK',
    lob: 'KeyL',
    sprint: 'ShiftLeft',
  },
  2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    flat: 'Enter',
    topspin: 'Comma',
    slice: 'Period',
    lob: 'Slash',
    sprint: 'ShiftRight',
    // Alternativas para teclados com numpad.
    topspinAlt: 'Numpad1',
    sliceAlt: 'Numpad2',
    lobAlt: 'Numpad3',
    sprintAlt: 'Numpad0',
  },
};

const PREVENT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
  'Slash',
]);

export function slotForPlayer(id) {
  return id === 'a1' ? 1 : 2;
}

export function createKeyboard(target = globalThis) {
  const down = new Set();
  const pressed = new Set();
  const onKeyDown = (e) => {
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
    if (PREVENT.has(e.code) && typeof e.preventDefault === 'function') e.preventDefault();
  };
  const onKeyUp = (e) => {
    down.delete(e.code);
  };
  const onBlur = () => down.clear();
  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
  }
  return {
    isDown: (code) => down.has(code),
    wasPressed: (code) => pressed.has(code),
    endFrame: () => pressed.clear(),
    clear: () => down.clear(),
  };
}

export function inputForSlot(keyboard, slot) {
  const map = MAPS[slot];
  const input = blankInput();
  if (!map) return input;
  const held = (code) => code && keyboard.isDown(code);
  input.up = held(map.up);
  input.down = held(map.down);
  input.left = held(map.left);
  input.right = held(map.right);
  const flat = !!held(map.flat);
  const topspin = !!(held(map.topspin) || held(map.topspinAlt));
  const slice = !!(held(map.slice) || held(map.sliceAlt));
  const lob = !!(held(map.lob) || held(map.lobAlt));
  input.topspin = topspin;
  input.slice = slice;
  input.lob = lob;
  input.sprint = !!(held(map.sprint) || held(map.sprintAlt));
  input.swing = flat || topspin || slice || lob;
  input.shot = topspin ? 'topspin' : slice ? 'slice' : lob ? 'lob' : 'flat';
  return input;
}

// Preenche world.inputs com os comandos dos jogadores humanos.
export function pumpHumanInputs(keyboard, world) {
  for (const p of world.players) {
    if (!p.human) continue;
    world.inputs[p.id] = inputForSlot(keyboard, slotForPlayer(p.id));
  }
}
