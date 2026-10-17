import { createKeyboard } from '../../src/input.js';
export function keyboardHarness() {
  const listeners={};
  const keyboard=createKeyboard({addEventListener:(key,fn)=>listeners[key]=fn,removeEventListener:key=>delete listeners[key]});
  return {keyboard,listeners,
    down:code=>listeners.keydown({code,repeat:false,preventDefault(){}}),
    up:code=>listeners.keyup({code}),
  };
}
