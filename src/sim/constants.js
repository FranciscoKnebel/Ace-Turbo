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
  GRAVITY: 10.5, // mais leve que o real: bolas flutuam mais e dao tempo de reacao
  AIR_DRAG: 0.08, // 1/s
  BOUNCE_RESTITUTION: 0.7, // quiques mais altos
  GROUND_FRICTION: 0.78, // multiplicador de vx/vy no quique
  BALL_RADIUS: 0.055,
  FENCE_Y: 20.0, // cerca bem atrás: dá para buscar a bola antes do 2º quique
  FENCE_X: 12.0,
  MAX_Z: 30,
  STOP_SPEED: 0.4,
  MAX_SUBSTEP: 1 / 240,
};

export const PLAYER = {
  RADIUS: 0.42,
  REACH: 1.25, // alcance da raquete (generoso para facilitar)
  REACH_HEIGHT: 2.35,
  ACCEL: 36,
  FRICTION: 10,
  MAX_SPEED: 5.4, // ritmo mais lento
  NET_MARGIN: 0.35, // não pode cruzar a rede
  SWING_WINDUP: 0.06, // atraso até a janela ativa
  SWING_ACTIVE: 0.24, // janela em que a raquete acerta
  SWING_RECOVER: 0.1,
  CHARGE_TIME: 1.0, // segundos para carga máxima
};

export const TURBO = {
  THRESHOLD: 0.75, // carga mínima para virar turbo
  COST: 30,
  MAX: 100,
  REGEN: 4, // por segundo
  POINT_GAIN: 12, // bônus ao vencer o ponto
  DEEP_BONUS: 1.05,
};

export const STAMINA = {
  MAX: 100,
  DRAIN: 32, // por segundo correndo (Shift)
  CHARGE_DRAIN: 16, // por segundo segurando a tecla de batida (carga)
  REGEN: 20, // por segundo recarregando (humanos)
  AI_REGEN: 0.6, // a IA recarrega mais devagar (fator sobre REGEN)
  SPEED_MULT: 1.45, // multiplicador de velocidade ao correr
  MIN_START: 12, // vigor mínimo para começar a correr
  LOW: 25, // abaixo disso o jogador está cansado
  LOW_SPEED: 0.82, // multiplicador de velocidade quando cansado
  LOW_CHARGE: 0.6, // multiplicador da velocidade de carga quando cansado
  // Pausa entre pontos: recupera de 10% (vigor 50) a 25% (vigor 99) da barra.
  PAUSE_REGEN_MIN: 0.1,
  PAUSE_REGEN_MAX: 0.25,
};

// Efeito lateral (Magnus simplificado) do slice, em m/s². Positivo curva para
// a esquerda do sentido de deslocamento, que nos dois lados da quadra empurra
// a bola para fora (em direção à lateral).
export const CURVE = {
  SLICE_SHOT: 3.2,
  SLICE_SERVE: 4.5,
};

// Superfícies: multiplicadores aplicados no quique. `bounce` mexe na altura
// (restituição) e `keep` no quanto a velocidade horizontal é mantida no chão.
export const SURFACES = {
  hard: { bounce: 1, keep: 1 }, // neutra (referência)
  clay: { bounce: 1.12, keep: 0.92 }, // saibro: quique alto, bola mais lenta
  grass: { bounce: 0.86, keep: 1.1 }, // grama: quique baixo, bola mais rápida
};
export const SURFACE_ORDER = ['hard', 'clay', 'grass'];

// Clima: horário (dia/noite) e vento. O vento é uma aceleração em m/s²
// aplicada na bola (direção livre, sorteada por partida no modo aleatório).
export const WEATHERS = {
  night: { time: 'night', wind: 0 },
  day: { time: 'day', wind: 0 },
  windy: { time: 'day', wind: 1 },
};
export const WEATHER_ORDER = ['night', 'day', 'windy', 'random'];
// Vento: intensidade (m/s²) e componentes sorteados.
export const WIND = {
  MIN: 0.5,
  MAX: 1.3,
  CROSS: 0.5, // fração máxima da intensidade no eixo x
  // Os golpes miram compensando o vento (como no tênis real); sobra um resíduo
  // de 15% para o vento ainda exigir ajuste.
  COMPENSATION: 0.85,
};

export const MATCH = {
  BEST_OF: 3,
  POINT_PAUSE: 2.2,
  SET_PAUSE: 3.4,
};

// Saque em dois estágios: 1) a carga define o toss (altura e qualidade);
// 2) a segunda carga/soltura é a batida, que vale mais perto do alto.
export const SERVE = {
  TOSS_VZ_MIN: 4.8, // lançamento baixo (carga baixa)
  TOSS_VZ_MAX: 7.6, // lançamento alto (carga cheia)
  TOSS_IDEAL_MIN: 0.6, // área do toss (90%+ de qualidade)
  TOSS_IDEAL_MAX: 0.9,
  TOSS_PERFECT_MIN: 0.02, // meia-largura da área de 100% com saque 50
  TOSS_PERFECT_MAX: 0.09, // meia-largura da área de 100% com saque 99
  TOSS_ERROR: 0.5, // desvio máximo de um toss ruim (m)
  CONTACT_IDEAL: 0.88, // fração do pico da bola para o contato ideal (na queda)
  CONTACT_TOLERANCE: 1.1, // tolerância em volta da altura ideal (m)
  RISE_PENALTY: 0.4, // multiplicador quando a bola é batida na subida
  HIT_MIN_Z: 0.5, // abaixo disso o toss foi perdido (falta)
};

export const DIFFICULTY = {
  easy: { skill: 0.35, speedMult: 0.72, reaction: 0.34 },
  normal: { skill: 0.55, speedMult: 0.86, reaction: 0.24 },
  hard: { skill: 0.75, speedMult: 1.0, reaction: 0.15 },
  unfair: { skill: 0.92, speedMult: 1.1, reaction: 0.05 },
  impossible: { skill: 0.99, speedMult: 1.25, reaction: 0.02 },
};
