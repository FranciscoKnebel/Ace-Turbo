// Versioned input schedule is data; baseline and current worlds use the same driver.
export function replayScenario({createWorld,stepWorld},scenario) {
  const world=createWorld(scenario.options),events=[];
  for(let tick=0;tick<scenario.ticks;tick++) {
    for(const p of world.players) if(p.human) {
      const phase=tick%scenario.inputScript.period;
      const input={up:false,down:false,left:false,right:false,swing:false,shot:'flat',topspin:false,slice:false,lob:false,sprint:false,aim:null};
      for(const item of scenario.inputScript.players[p.id]??[]) if(phase>=item.from&&phase<item.to)Object.assign(input,item.input);
      world.inputs[p.id]=input;
    }
    stepWorld(world,scenario.dt);
    if(world.events.length)events.push({tick,events:structuredClone(world.events)});
  }
  return {phase:world.phase,score:JSON.parse(JSON.stringify(world.score)),stats:structuredClone(world.stats),
    players:world.players.map(p=>({id:p.id,x:p.x,y:p.y,stamina:p.stamina})),
    ball:{x:world.ball.x,y:world.ball.y,z:world.ball.z},events};
}
