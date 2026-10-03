import { blankInput } from './sim/ai.js';

// Mapa de teclas por "slot" de jogador: 1 = P1 (te a), 2 = P2 (te a2 ou b1).
const MAPS = {
  1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', swing: 'Space' },
  2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    swing: 'Enter',
  },
};

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
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)
    ) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
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
  input.up = keyboard.isDown(map.up);
  input.down = keyboard.isDown(map.down);
  input.left = keyboard.isDown(map.left);
  input.right = keyboard.isDown(map.right);
  input.swing = keyboard.isDown(map.swing);
  return input;
}

// Preenche world.inputs com os comandos dos jogadores humanos.
export function pumpHumanInputs(keyboard, world) {
  for (const p of world.players) {
    if (!p.human) continue;
    world.inputs[p.id] = inputForSlot(keyboard, slotForPlayer(p.id));
  }
}
