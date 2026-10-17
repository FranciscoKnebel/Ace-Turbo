export function blankInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    swing: false,
    shot: 'flat',
    topspin: false,
    slice: false,
    lob: false,
    sprint: false,
    // Mira explícita (usada pela IA para mirar sem se mover).
    aim: null,
  };
}

// Domain messages are language independent and can be logged/replayed.
export function message(key, params = {}) { return { key, params }; }
export const PHASES = Object.freeze(['serve', 'rally', 'pointover', 'matchover']);

export const POINT_REASONS = Object.freeze(['partner', 'player', 'net', 'outOfArea', 'doubleBounce', 'point', 'out', 'ace', 'doubleFault']);
