import { DIFFICULTY, MATCH, SURFACES, WEATHERS } from './constants.js';
export const MODES = {
  coop: {
    doubles: true,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'a2', team: 'a', human: true, prefSide: -1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
      { id: 'b2', team: 'b', human: false, prefSide: 1 },
    ],
  },
  singles: {
    doubles: false,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
    ],
  },
  versus: {
    doubles: false,
    players: [
      { id: 'a1', team: 'a', human: true, prefSide: 1 },
      { id: 'b1', team: 'b', human: true, prefSide: -1 },
    ],
  },
  demo: {
    doubles: true,
    players: [
      { id: 'a1', team: 'a', human: false, prefSide: 1 },
      { id: 'a2', team: 'a', human: false, prefSide: -1 },
      { id: 'b1', team: 'b', human: false, prefSide: -1 },
      { id: 'b2', team: 'b', human: false, prefSide: 1 },
    ],
  },
};

// Normalize once at the boundary; metadata and runtime always agree.
/** @returns {import("./contracts.js").MatchOptions} */
export function normalizeMatchOptions(options = {}) {
  const o = options && typeof options === 'object' ? options : {};
  return {
    mode: MODES[o.mode] ? o.mode : 'singles',
    difficulty: DIFFICULTY[o.difficulty] ? o.difficulty : 'normal',
    seed: Number.isFinite(o.seed) ? Math.trunc(o.seed) >>> 0 : 1,
    bestOf: [1, 3, 5].includes(o.bestOf) ? o.bestOf : MATCH.BEST_OF,
    surface: SURFACES[o.surface] ? o.surface : 'hard',
    weather: WEATHERS[o.weather] || o.weather === 'random' ? o.weather : 'night',
    noAd: o.noAd === true,
    superTiebreak: o.superTiebreak === true,
    players: o.players && typeof o.players === 'object' ? o.players : {},
  };
}
