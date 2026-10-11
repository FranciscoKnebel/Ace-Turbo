import { NET } from '../constants.js';
import { DEFAULT_TRAITS, tirednessOf } from '../stats.js';
import { otherTeam } from '../court-sides.js';
export function netOpponents(world, player) {
  const oppTeam = otherTeam(player.team);
  return world.players.filter((p) => p.team === oppTeam && Math.abs(p.y) < NET.VOLLEY_Y);
}

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
  if (
    world.rng() <
    0.35 - traits.aggression * 0.12 + tiredness * 0.35 - netOpp * NET.COUNTER_CENTER
  ) {
    return 0;
  }
  // Contra a rede, o lado aberto é medido só pelos adversários adiantados: o
  // parceiro fundo não pode cancelar a posição do net rusher e mandar a bola
  // justamente na raquete dele.
  const advanced = netOpp
    ? opponents.filter((p) => Math.abs(p.y) < NET.VOLLEY_Y)
    : opponents;
  const ref = advanced.length ? advanced : opponents;
  const avg = ref.reduce((s, p) => s + p.x, 0) / ref.length;
  const open = avg <= 0 ? 1 : -1; // lado aberto em coordenadas do mundo
  return open;
}

