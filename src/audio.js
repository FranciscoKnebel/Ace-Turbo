// Each application instance owns its context, voices and deferred notes.
export function createAudio() {
  let ctx = null, muted = false, disposed = false;
  const timers = new Set(), voices = new Set();
  function stopVoices() { for (const voice of voices) { try { voice.stop(); } catch {} } voices.clear(); }
  function cancelNotes() { for (const timer of timers) clearTimeout(timer); timers.clear(); }
  function context() {
    if (disposed || muted || typeof window === 'undefined') return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx ??= new AC();
      if (ctx.state === 'suspended') Promise.resolve(ctx.resume()).catch(() => {});
      return ctx;
    } catch { return null; }
  }
  function blip(freq, dur, type = 'sine', gain = 0.07, slide = 0) {
    const ac = context(); if (!ac) return;
    try {
      const oscillator = ac.createOscillator(), volume = ac.createGain(); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); volume.disconnect(); };
      oscillator.type = type; oscillator.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
      volume.gain.setValueAtTime(gain, ac.currentTime); volume.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      oscillator.connect(volume); volume.connect(ac.destination); oscillator.start(); oscillator.stop(ac.currentTime + dur);
    } catch { /* Audio is optional. */ }
  }
  function later(delay, play) {
    if (disposed || muted) return;
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed && !muted) play(); }, delay); timers.add(timer);
  }
  return {
    hit: () => blip(330, 0.08, 'triangle', 0.1), smash: () => blip(180, 0.12, 'square', 0.1, 120),
    volley: () => blip(420, 0.06, 'triangle', 0.1), slice: () => blip(210, 0.12, 'sine', 0.07, -50),
    lob: () => blip(470, 0.1, 'triangle', 0.07, 80), serve: () => blip(250, 0.07, 'triangle', 0.09),
    bounce: () => blip(170, 0.06, 'sine', 0.06, -60), net: () => blip(95, 0.12, 'sawtooth', 0.05),
    turbo: () => blip(190, 0.2, 'sawtooth', 0.08, 420), fault: () => blip(140, 0.22, 'square', 0.05, -60),
    point: () => { blip(520, 0.09, 'sine', 0.08); later(90, () => blip(660, 0.14, 'sine', 0.07)); },
    menu: () => blip(440, 0.05, 'sine', 0.05),
    start: () => { blip(392, 0.09, 'sine', 0.07); later(100, () => blip(523, 0.12, 'sine', 0.07)); later(200, () => blip(659, 0.16, 'sine', 0.07)); },
    setMuted: value => { muted = Boolean(value); if (muted) { cancelNotes(); stopVoices(); } },
    dispose: () => { if (disposed) return; disposed = true; cancelNotes(); stopVoices(); if (ctx) { try { Promise.resolve(ctx.close()).catch(() => {}); } catch {} } ctx = null; },
  };
}
