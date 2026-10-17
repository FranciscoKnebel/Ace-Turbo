import { message } from '../contracts.js';
export function setMessage(world, text, time = 0) {
  world.message = text;
  world.messageTimer = time;
}

