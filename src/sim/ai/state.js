export function createAI({ skill = 0.7, speedMult = 1, reaction = 0.16 } = {}) {
  return {
    skill,
    speedMult,
    reaction,
    reactTimer: 0,
    decideTimer: 0,
    lastHitKey: null,
    intercept: null,
    goingOut: false,
    holding: false,
    holdT: 0,
    holdTarget: 0.6,
    holdReleaseT: null,
    pendingShot: null,
    shotType: 'flat',
    aimDepth: 0,
    aimX: 1,
    serveId: -1,
    lastServeId: -1,
    serveWait: 0,
    serveCharge: 0.7,
    tossCharge: 0.75,
    serveAimX: 1,
    serveDepth: -1,
    serveShot: 'flat',
    serveShotAttempt: 0,
  };
}

// Estado inicial de input; sempre reutilizado para não alocar por frame.
