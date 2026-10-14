// Tunable rally parameters. Units: metres and dimensionless multipliers.
export const SHOT_PROFILES = Object.freeze({
  flat: Object.freeze({ near: 4.5, deep: 10.9, bounce: 1 }),
  topspin: Object.freeze({ near: 6.8, deep: 11.4, bounce: 1.3 }),
  slice: Object.freeze({ depth: 0.92, speed: 0.78, bounce: 0.5 }),
  lob: Object.freeze({ deep: 10.6, flight: 1.5, bounce: 0.95 }),
});
