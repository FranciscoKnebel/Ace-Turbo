// Deterministic doubles arbitration, independent of contact style.
export function ownsClaim(world, player, reference) {
  const mine = Math.hypot(reference.x - player.x, reference.y - player.y);
  return !world.players.some(mate => {
    if (mate.team !== player.team || mate.id === player.id || !mate.ai) return false;
    const theirs = Math.hypot(reference.x - mate.x, reference.y - mate.y);
    return theirs < mine - 0.05 || (Math.abs(theirs - mine) <= 0.05 && mate.id < player.id);
  });
}
