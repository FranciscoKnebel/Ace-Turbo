import { enterPointPause } from './phases.js';
import { message, POINT_REASONS } from '../contracts.js';
import { MATCH, TURBO } from '../constants.js';
import { makeStats, observeTelemetry, snapshotStats } from '../systems/telemetry.js';
import { setMessage } from '../systems/messages.js';
import { applySetFatigue } from '../systems/energy.js';
export function awardPoint(world, team, reason) {
  if (!POINT_REASONS.includes(reason)) reason = 'point';
  if (world.phase !== 'serve' && world.phase !== 'rally') return;
  const evs = world.score.awardPoint(team);
  observeTelemetry(world, { type: 'point', reason });
  world.lastPoint = { team, reason };
  for (const p of world.players) {
    // Encerra qualquer golpe/carga em andamento: sem isso um swing ativo
    // acertava a bola na pausa e revertia a fase para 'rally' (o ponto não
    // resetava para o saque, principalmente depois de um ace).
    p.charging = false;
    p.charge = 0;
    p.swing = null;
    if (p.team === team) p.turbo = Math.min(TURBO.MAX, p.turbo + TURBO.POINT_GAIN);
  }
  const gameWon = evs.some((e) => e.type === 'game');
  const setWon = evs.some((e) => e.type === 'set');
  const matchWon = evs.some((e) => e.type === 'match');
  if (setWon) {
    // Fim de set: guarda o retrato do set para a tela de estatísticas e começa
    // um set novo em branco (o total da partida continua em `stats`). A barra
    // de vigor encolhe um pouco para o set seguinte (fadiga de partida).
    world.setSummary = snapshotStats(world.setStats);
    world.setHistory.push(world.setSummary);
    world.setStats = makeStats();
    // Sem próximo set (fim de jogo) não há fadiga a aplicar: um set único não
    // tem fadiga e o estado final não muda depois da última bola.
    if (!matchWon) applySetFatigue(world);
  }
  let msg;

  if (matchWon) msg = message('msg.matchWon', { team });
  else if (setWon) msg = message('msg.setWon', { team });
  else if (gameWon) msg = message('msg.gameWon', { team });
  else if (reason === 'doubleFault') msg = message('msg.doubleFault', { team });
  else msg = message('msg.point', { reason, team });
  const pause = gameWon || setWon ? MATCH.SET_PAUSE : MATCH.POINT_PAUSE;
  setMessage(world, msg, pause);
  enterPointPause(world, pause);
  world.events.push({ type: 'point', team, reason, gameWon, setWon, matchWon });
}
