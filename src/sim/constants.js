// Dimensões oficiais da quadra (metros) e constantes ajustadas para gameplay.
export const COURT = {
  HALF_LENGTH: 11.885, // linha de fundo
  SINGLES_HALF_WIDTH: 4.115,
  DOUBLES_HALF_WIDTH: 5.485,
  SERVICE_LINE: 6.4, // distância da rede
  NET_HALF_WIDTH: 5.485,
  NET_HEIGHT_CENTER: 0.914,
  NET_HEIGHT_POST: 1.07,
};

export const PHYS = {
  GRAVITY: 12.5, // levemente mais forte que a real para arcos mais ágeis
  AIR_DRAG: 0.08, // 1/s
  BOUNCE_RESTITUTION: 0.62,
  GROUND_FRICTION: 0.78, // multiplicador de vx/vy no quique
  BALL_RADIUS: 0.055,
  FENCE_Y: 13.4,
  FENCE_X: 8.0,
  MAX_Z: 30,
  STOP_SPEED: 0.4,
  MAX_SUBSTEP: 1 / 240,
};

export const PLAYER = {
  RADIUS: 0.42,
  REACH: 1.05, // alcance da raquete
  REACH_HEIGHT: 2.35,
  ACCEL: 42,
  FRICTION: 9,
  MAX_SPEED: 6.8, // velocidade base humana
  NET_MARGIN: 0.35, // não pode cruzar a rede
  SWING_WINDUP: 0.06, // atraso até a janela ativa
  SWING_ACTIVE: 0.18, // janela em que a raquete acerta
  SWING_RECOVER: 0.1,
  CHARGE_TIME: 0.85, // segundos para carga máxima
  HIT_COOLDOWN: 0.25,
};

export const TURBO = {
  THRESHOLD: 0.75, // carga mínima para virar turbo
  COST: 30,
  MAX: 100,
  REGEN: 4, // por segundo
  POINT_GAIN: 12, // bônus ao vencer o ponto
  DEEP_BONUS: 1.05,
};

export const MATCH = {
  BEST_OF: 3,
  POINT_PAUSE: 1.4,
  SET_PAUSE: 2.4,
};

export const DIFFICULTY = {
  easy: { skill: 0.45, speedMult: 0.6, reaction: 0.26 },
  normal: { skill: 0.7, speedMult: 0.72, reaction: 0.16 },
  hard: { skill: 0.88, speedMult: 0.88, reaction: 0.09 },
};
