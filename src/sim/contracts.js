/**
 * @typedef {'a'|'b'} TeamId Stable identity, independent of court side.
 * @typedef {'flat'|'topspin'|'slice'|'lob'} ShotId
 * @typedef {Object} PlayerInput
 * @property {boolean} up
 * @property {boolean} down
 * @property {boolean} left
 * @property {boolean} right
 * @property {boolean} swing Held action; queued edges consumed once per tick.
 * @property {boolean} sprint
 * @property {ShotId} shot
 * @property {{x:number,depth:number}|null} aim
 * @typedef {{key:string,params:Object}} DomainMessage
 * @typedef {{type:string,player?:string,team?:TeamId,reason?:string,shot?:string,attempt?:number,quality?:number}} DomainEvent
 * @typedef {{mode:string,difficulty:string,seed:number,bestOf:1|3|5,surface:string,weather:string,noAd:boolean,superTiebreak:boolean,players:Object}} MatchOptions
 * @typedef {Object} World
 * @property {'serve'|'rally'|'pointover'|'matchover'} phase
 * @property {number} elapsed Seconds advanced by valid ticks.
 * @property {number} seed
 * @property {DomainEvent[]} events Synchronous events for the current tick.
 * @property {Object.<string,PlayerInput>} inputs
 * @property {Object} serve Service state checked by assertMatchInvariants.
 * @property {Object} ball
 * @property {Object[]} players
 * @property {Object} score
 * @property {Object} stats
 * @property {Object} setStats
 * @property {Object[]} setHistory
 */
/** @returns {PlayerInput} */
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
