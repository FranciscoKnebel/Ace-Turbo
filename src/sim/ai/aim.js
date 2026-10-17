import { clamp } from '../math.js';
import { NET } from '../constants.js';
import { DEFAULT_TRAITS, tirednessOf } from '../stats.js';
import { otherTeam } from '../court-sides.js';
export function netOpponents(world, player) {
  const oppTeam = otherTeam(player.team);
  return world.players.filter((p) => p.team === oppTeam && Math.abs(p.y) < NET.VOLLEY_Y);
}

// Alcance lateral da mira (m): converte alvo normalizado em x do mundo.
export const aimScale = (world) => (world.doubles ? 4.2 : 3.5);

export function chooseAimX(world, player) {
  const oppTeam = otherTeam(player.team);
  const opponents = world.players.filter((p) => p.team === oppTeam);
  if (!opponents.length) return world.rng() < 0.5 ? -1 : 1;
  const traits = player.traits ?? DEFAULT_TRAITS;
  // Cansado, a IA fica conservadora e joga mais pelo centro (menos ângulo e
  // menos risco de erro na linha). Contra um adversário na rede é o contrário:
  // o centro entrega a bola na raquete dele, então a mira vira passada.
  const tiredness = tirednessOf(player);
  const netOpp = netOpponents(world, player).length;
  // Dois adversários na rede em alas opostas: o alvo é o meio do vão real
  // entre eles, não o lado apontado pela média das posições.
  const advanced = netOpp ? opponents.filter(p => Math.abs(p.y) < NET.VOLLEY_Y) : [];
  const straddles = advanced.some(p => p.x < -0.25) && advanced.some(p => p.x > 0.25);
  const roll = world.rng();
  const centerP = clamp(0.35 - traits.aggression * 0.12 + tiredness * 0.35 - netOpp * NET.COUNTER_CENTER, 0, 1);
  // Mira explícita normalizada (0 = centro da quadra): o vão central vira o
  // meio do intervalo para a bola não sair na raquete de um straddler.
  if (straddles) {
    const xs = advanced.map(p => p.x);
    return clamp(((Math.min(...xs) + Math.max(...xs)) / 2) / aimScale(world), -1, 1);
  }
  // null = neutro de propósito; o executeRallyShot aplica o default (p.x * 0.7).
  if (roll < centerP) return null;
  const ref = advanced.length ? advanced : opponents;
  const avg = ref.reduce((s, p) => s + p.x, 0) / ref.length;
  const open = avg <= 0 ? 1 : -1; // lado aberto em coordenadas do mundo
  return open;
}

