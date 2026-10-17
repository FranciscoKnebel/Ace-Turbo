// Bounded diagnostics outside world/RNG state. Observers must be synchronous.
const states=new WeakMap();
export function observeDecisions(world, observer) {
  const state={observer,latest:new Map(),trace:[]};states.set(world,state);
  return ()=>{if(states.get(world)===state)states.delete(world);};
}
export function recordDecision(world, player, decision) {
  const state=states.get(world);if(!state)return;
  const signature=JSON.stringify([world.serve.id,world.ball.lastHit?.player,world.ball.bounces.length,decision.reason,decision.owner,decision.goingOut]);
  if(state.latest.get(player.id)===signature)return;
  state.latest.set(player.id,signature);
  const entry={elapsed:world.elapsed,player:player.id,team:player.team,...decision};
  state.trace.push(entry);if(state.trace.length>200)state.trace.shift();state.observer?.(entry);
}
export function decisionTrace(world) {return structuredClone(states.get(world)?.trace??[]);}
