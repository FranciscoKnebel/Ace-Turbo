import { recordDecision } from './diagnostics.js';
import { courtOutDistance, boxOutDistance } from '../geometry.js';
import { JUDGE, NET, PLAYER, STAMINA } from '../constants.js';
import { trajectoryFor } from './perception-cache.js';
import { claimOwner } from './claims.js';
import { sideOf, handFrame, FOREHAND_OFFSET, teamOfSide } from '../court-sides.js';

export function planIntercept(world, player, ball) {
  const finish=(plan,reason,details={})=>{recordDecision(world,player,{reason,goingOut:plan.goingOut,...details});return {...plan,reason};};
  // Preparação do saque (bola na mão ou no toss): a bola ainda não está em
  // jogo, ninguém planeja interceptação.
  if (world.phase === 'serve' && !world.serve.inFlight) {
    return finish({ intercept: null, goingOut: false, doubtful: false }, 'servePreparation');
  }
  // Em duplas, só o recebedor designado pode devolver o saque: o parceiro não
  // corre atrás da bola (ele não pode rebater mesmo).
  if (
    world.serve.returnPending &&
    world.serve.receiverId &&
    player.id !== world.serve.receiverId &&
    player.team === world.serve.receiverTeam
  ) {
    return finish({ intercept: null, goingOut: false, doubtful: false }, 'designatedReceiver');
  }
  const pred = trajectoryFor(world, ball);
  let judgment = null;
  let goingOut = false;
  let doubtful = false;
  if (ball.bounces.length === 0) {
    const first = pred.bounces.find((b) => teamOfSide(b.y) === (player.side ?? player.team));
    if (first) {
      const isServe = ball.lastHit && ball.lastHit.isServe;
      // No saque, "fora" é fora da caixa de serviço; no rally, fora da quadra.
      // Perto da linha o jogador não arrisca deixar passar: só desiste quando a
      // bola está bem fora (com uma variação de julgamento).
      // A margem é sorteada uma vez por golpe recebido (cacheada no stepAI):
      // reamostrar a cada recálculo faria a IA alternar entre ir e deixar.
      const margin = player.ai?.outMargin ?? JUDGE.OUT_MARGIN;
      const outDist = isServe
        ? boxOutDistance(first.x, first.y, world.serve.box)
        : courtOutDistance(first.x, first.y, world.doubles);
      judgment = { outDistance: outDist, margin, bounce: first };
      if (outDist > margin) goingOut = true;
      else if (outDist > 0) doubtful = true; // cairia fora, mas por pouco
    }
  }
  if (goingOut) return finish({ intercept: null, goingOut: true, doubtful: false }, 'outJudgment', judgment);
  const side = sideOf(player.side ?? player.team);
  // O recebedor designado tem a preferência e espera a bola na linha de fundo.
  const returningServe = world.serve.returnPending && world.serve.receiverId === player.id;
  // Prefere bater depois do quique (golpe de fundo) em vez de correr à rede
  // para volear: isso evita avanços excessivos e erros não forçados.
  const alreadyBounced = ball.bounces.length > 0;
  const bounce = pred.bounces.find((b) => teamOfSide(b.y) === (player.side ?? player.team));
  const minT = alreadyBounced ? 0 : bounce ? bounce.t : 0;
  const pick = (minZ, maxZ) => {
    for (const s of pred.samples) {
      if (teamOfSide(s.y) !== (player.side ?? player.team)) continue;
      if (s.t < minT) continue;
      if (s.z >= minZ && s.z <= maxZ) {
        // Fica um pouco atrás do quique. A escolha da mão:
        // - bola no lado do forehand (ou tempo de sobra): "abre" para bater de
        //   forehand, deslocando para o lado;
        // - bola no backhand e sem tempo: encaixa o backhand, ficando um pouco
        //   à frente da linha da bola (do lado do forehand).
        const baseY = s.y + side * 1.2;
        const travel =
          Math.hypot(s.x - player.x, baseY - player.y) / Math.max(1, player.maxSpeed * STAMINA.SPEED_MULT);
        const slack = s.t - travel;
        const ballSide = (s.x - player.x) * handFrame(player.side ?? player.team);
        const goForehand = ballSide >= -0.3 || slack > 0.95;
        const offset = goForehand
          ? slack > 0.3
            ? FOREHAND_OFFSET
            : slack > 0.12
              ? FOREHAND_OFFSET * 0.6
              : FOREHAND_OFFSET * 0.3
          : -0.45; // backhand encaixado
        // `shared` é o ponto de contato comum (sem o deslocamento de mão), usado
        // na arbitragem das duplas; `personal` é o alvo já deslocado.
        return {
          shared: { x: s.x, y: baseY, t: s.t },
          personal: { x: s.x - handFrame(player.side ?? player.team) * offset, y: baseY, t: s.t },
        };
      }
    }
    return null;
  };
  // Prefere bater na altura confortável (0,55 a 1,1 m); se não der, aceita
  // bola baixa (meio-voleio) ou alta (voleio/smash).
  // Golpe rasteiro perto do quique (chega a tempo); se não der, aceita uma bola
  // mais alta. O gatilho do meio-voleio é estrito, então isso não vira
  // "meio-voleio" no placar.
  // Devolução de saque: favorece esperar a bola na altura da linha de fundo
  // (a bola vem até o recebedor) em vez de correr para dentro da quadra. A
  // referência é a posição de FORMAÇÃO, não a posição atual: senão o alvo
  // "anda" junto com o jogador e ele acaba correndo até a linha de saque.
  // Voleio: quem está adiantado ataca a bola antes do quique, em vez de
  // recuar para o fundo. Só vale se a bola passa na altura de voleio e dá tempo
  // de chegar; senão a IA cai no golpe de fundo normal.
  const volleyPick = () => {
    if (Math.abs(player.y) > NET.VOLLEY_Y) return null;
    const bounceT = bounce ? bounce.t : Infinity;
    for (const s of pred.samples) {
      if (teamOfSide(s.y) !== (player.side ?? player.team)) continue;
      if (s.t >= bounceT - 0.02) break;
      if (s.z < 0.25 || s.z > PLAYER.REACH_HEIGHT - 0.1) continue;
      if (Math.abs(s.y) > NET.VOLLEY_BALL_Y) continue;
      const travel =
        Math.hypot(s.x - player.x, s.y - player.y) / Math.max(1, player.maxSpeed * STAMINA.SPEED_MULT);
      if (s.t - travel < 0.05) continue;
      return {
        shared: { x: s.x, y: s.y, t: s.t },
        personal: { x: s.x - handFrame(player.side ?? player.team) * 0.3, y: s.y, t: s.t },
      };
    }
    return null;
  };
  const deepY = Math.abs(player.homeY ?? player.y);
  const deepPick = () => {
    for (const s of pred.samples) {
      if (teamOfSide(s.y) !== (player.side ?? player.team)) continue;
      if (s.t < minT) continue;
      if (s.z < 0.2 || s.z > PLAYER.REACH_HEIGHT - 0.1) continue;
      if (Math.abs(s.y) >= deepY - 1.5) {
        // Devolução: deslocamento menor (o saque vem rápido).
        return {
          shared: { x: s.x, y: s.y, t: s.t },
          personal: { x: s.x - handFrame(player.side ?? player.team) * 0.35, y: s.y, t: s.t },
        };
      }
    }
    return null;
  };
  const chosen = returningServe
    ? deepPick() ?? pick(0, 0.9) ?? pick(0, PLAYER.REACH_HEIGHT - 0.1)
    : volleyPick() ?? pick(0, 0.9) ?? pick(0, PLAYER.REACH_HEIGHT - 0.1);
  if (!chosen) return finish({ intercept: null, goingOut: false, doubtful: false }, 'noContactInHorizon', { termination: pred.termination });
  const { shared, personal } = chosen;
  // Em duplas, só o parceiro mais perto persegue a bola (o outro cobre a
  // outra metade), evitando os dois irem juntos e ficarem colados. Na devolução
  // do saque o recebedor designado tem a preferência: o parceiro não pode
  // rebater, então não pode "roubar" o claim.
  if (world.doubles && !returningServe) {
    // A arbitragem usa a MESMA referência para os dois: o quique previsto no
    // nosso lado. Cada parceiro pode ter escolhido um contato diferente (voleio
    // x golpe de fundo), então o ponto de contato não serve; senão os dois se
    // acham os mais perto e correm juntos.
    // Without a bounce in the horizon, both partners use the same first sample.
    const reference=bounce ?? pred.samples.find(s=>teamOfSide(s.y)===(player.side??player.team)) ?? shared;
    const owner=claimOwner(world,player.team,reference);
    if(owner!==player.id)return finish({ intercept:null,goingOut:false }, 'partnerClaim', {owner,reference});
  }
  return finish({ intercept: personal, goingOut: false, doubtful }, 'intercept', { intercept: personal });
}

// Escolha do tipo de batida da CPU: top spin agressivo na maioria das vezes,
// flat como opção segura, slice e lob como variação; smash na bola alta.
