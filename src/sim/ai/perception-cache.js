import { predictTrajectory } from '../physics.js';
const cache = new WeakMap();
export function trajectoryFor(world, ball) {
  const signature = [world.elapsed, world.doubles, ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz,
    ball.curve, ball.bounceScale, ball.surface, ball.wind?.x, ball.wind?.y, ball.dead, ball.onGround,
    ball.sinceBounce, ball.bounces?.length].join('|');
  const previous = cache.get(world);
  if (previous?.signature === signature) return previous.value;
  const value = predictTrajectory(ball, { maxT: 4.5, step: 0.02, doubles: world.doubles });
  cache.set(world, { signature, value });
  return value;
}
