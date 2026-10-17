import { NET } from '../constants.js';
import { clamp } from '../math.js';
import { DEFAULT_TRAITS, tirednessOf } from '../stats.js';
import { netOpponents } from '../ai/aim.js';
export function chooseShot(world, player, ball) {
  const traits = player.traits ?? DEFAULT_TRAITS;
  const smash = ball.z > 1.3 && Math.abs(player.y) < 5;
  if (smash) return { type: 'flat', depth: 1, hold: 0.32 };
  const r = world.rng();
  // Reação à rede: com um adversário adiantado, o lob vira arma (é o contra
  // clássico do net rusher). O resto da escolha segue os traços da classe.
  const netOpp = netOpponents(world, player).length;
  // A classe desloca as probabilidades: agressivos batem mais flat/top spin,
  // defensivos usam mais slice e lob. Cansada, a IA fica conservadora: mais
  // slice/lob (que erram menos), menos força e alvo mais curto (sem subir à
  // rede e com mais margem até a linha de fundo).
  const tiredness = tirednessOf(player);
  // Bola duvidosa (cairia fora por pouco): o jogador foi nela, mas joga seguro
  // em vez de arriscar de uma posição ruim.
  const doubtful = player.ai?.doubtful ? 1 : 0;
  // Teto: cansaço, reação à rede e bola duvidosa somam, mas ninguém vira uma
  // máquina de lobs.
  const lobP = Math.min(
    0.45,
    0.04 + traits.lob * 0.1 + tiredness * 0.14 + netOpp * NET.COUNTER_LOB + doubtful * 0.2,
  );
  const sliceP = lobP + 0.08 + traits.slice * 0.14 + tiredness * 0.14 + doubtful * 0.2;
  const flatP = sliceP + 0.16 + (1 - traits.spin) * 0.14;
  const power = (traits.aggression - 0.5) * 0.2 - tiredness * 0.15;
  const holdMul = (1 - 0.25 * tiredness) * (1 - 0.2 * doubtful);
  const depth = tiredness > 0.35 && world.rng() < 0.45 ? 0 : 1;
  if (r < lobP) return { type: 'lob', depth: 1, hold: (0.3 + world.rng() * 0.2) * holdMul };
  if (r < sliceP) {
    return { type: 'slice', depth: 0, hold: (0.55 + world.rng() * 0.25) * holdMul };
  }
  if (r < flatP) {
    return {
      type: 'flat',
      depth,
      hold: clamp(
        (0.45 + player.ai.skill * 0.4 + world.rng() * 0.2 + power) * holdMul,
        0.3,
        0.95,
      ),
    };
  }
  return {
    type: 'topspin',
    depth,
    hold: clamp(
      (0.55 + player.ai.skill * 0.4 + world.rng() * 0.2 + power) * holdMul,
      0.4,
      1.05,
    ),
  };
}

// Mira: prefere o lado oposto ao adversário, mas nem sempre na linha: parte
// das bolas vai pelo centro para não estourar a lateral com o erro somado.
// Distância além da quadra (0 quando dentro). A linha vale como dentro, então
// desconta o raio da bola.
