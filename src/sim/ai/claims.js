// One deterministic winner for a common team reference at a tick boundary.
const cache=new WeakMap();
export function claimOwner(world, team, reference) {
  const mates=world.players.filter(p=>p.team===team&&p.ai);
  const signature=[world.elapsed,reference.x,reference.y,...mates.flatMap(p=>[p.id,p.x,p.y])].join('|');
  let teams=cache.get(world);if(!teams){teams=new Map();cache.set(world,teams);}
  if(teams.get(team)?.signature===signature)return teams.get(team).owner;
  const ranked=mates.map(p=>({id:p.id,d:Math.hypot(reference.x-p.x,reference.y-p.y)}));
  ranked.sort((a,b)=>Math.abs(a.d-b.d)<=.05 ? (a.id<b.id?-1:a.id>b.id?1:0) : a.d-b.d);
  const owner=ranked[0]?.id??null;teams.set(team,{signature,owner});return owner;
}
export function ownsClaim(world, player, reference) {return claimOwner(world,player.team,reference)===player.id;}
