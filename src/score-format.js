// Super tiebreaks retain game accounting (1-0) but display their point score.
export function formatSetScore(set) {
  const score = set.superTiebreak ? set.tiebreak : set;
  return `${score.a}-${score.b}`;
}
