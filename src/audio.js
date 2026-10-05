// Efeitos sonoros minimalistas com WebAudio (sem assets externos).
let ctx = null;

function ensureContext() {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq, dur, type = 'sine', gain = 0.07, slide = 0) {
  const ac = ensureContext();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
    }
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  } catch {
    /* áudio é opcional */
  }
}

export function createAudio() {
  return {
    hit: () => blip(330, 0.08, 'triangle', 0.1),
    smash: () => blip(180, 0.12, 'square', 0.1, 120),
    volley: () => blip(420, 0.06, 'triangle', 0.1),
    slice: () => blip(210, 0.12, 'sine', 0.07, -50),
    lob: () => blip(470, 0.1, 'triangle', 0.07, 80),
    serve: () => blip(250, 0.07, 'triangle', 0.09),
    bounce: () => blip(170, 0.06, 'sine', 0.06, -60),
    net: () => blip(95, 0.12, 'sawtooth', 0.05),
    turbo: () => blip(190, 0.2, 'sawtooth', 0.08, 420),
    fault: () => blip(140, 0.22, 'square', 0.05, -60),
    point: () => {
      blip(520, 0.09, 'sine', 0.08);
      setTimeout(() => blip(660, 0.14, 'sine', 0.07), 90);
    },
    menu: () => blip(440, 0.05, 'sine', 0.05),
    start: () => {
      blip(392, 0.09, 'sine', 0.07);
      setTimeout(() => blip(523, 0.12, 'sine', 0.07), 100);
      setTimeout(() => blip(659, 0.16, 'sine', 0.07), 200);
    },
  };
}
