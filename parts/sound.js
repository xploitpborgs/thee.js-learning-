/* Sound · small synthesised cues, off until the visitor turns them on. There are no audio files: every
   sound is built from oscillators and filtered noise with the Web Audio API, so nothing extra loads. */
(function () {
  'use strict';
  let ctx = null, master = null, hum = null, on = false;

  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    // the fleet's hum: three low partials through a lowpass, faded in and out by the page
    hum = ctx.createGain(); hum.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    [[55, 'triangle', 0.6], [110.5, 'sine', 0.3], [164.8, 'sine', 0.12]].forEach(([f, type, level]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = level;
      o.connect(g).connect(lp); o.start();
    });
    lp.connect(hum).connect(master);
  }
  function envelope(g, t, attack, decay, peak) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(freq, dur, type = 'sine', peak = 0.2, slide = 0, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    envelope(g, t, 0.005, dur, peak);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, peak = 0.2, freq = 2000, q = 1, delay = 0, type = 'bandpass') {
    const t = ctx.currentTime + delay, len = Math.ceil(ctx.sampleRate * (dur + 0.02)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    envelope(g, t, 0.002, dur, peak);
    s.connect(f).connect(g).connect(master); s.start(t);
  }

  const CUES = {
    plug: () => { noise(0.05, 0.5, 3200, 2); tone(2400, 0.04, 'square', 0.04); noise(0.08, 0.25, 900, 1, 0.03); },
    wake: () => { tone(523.25, 0.5, 'sine', 0.08); tone(783.99, 0.7, 'sine', 0.06, 0, 0.08); },
    close: () => { noise(0.09, 0.45, 600, 0.8); tone(110, 0.12, 'sine', 0.2, 0.6); },
    open: () => { noise(0.06, 0.15, 1800, 1); },
    pulse: () => { noise(0.6, 0.18, 700, 0.6, 0, 'lowpass'); tone(220, 0.5, 'sine', 0.05, 2); },
    iso: combo => { tone(440 * Math.pow(1.122, Math.min(combo || 1, 8) - 1), 0.12, 'triangle', 0.14); },
    miss: () => { tone(150, 0.15, 'square', 0.05, 0.7); },
    policy: () => { noise(0.8, 0.22, 500, 0.5, 0, 'lowpass'); tone(330, 0.6, 'sine', 0.06, 2.2); },
    wave: () => { [0, 0.22, 0.44].forEach(delay => tone(880, 0.16, 'sawtooth', 0.05, 0.75, delay)); },
    win: () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, 0, i * 0.11)); },
    breach: () => { tone(110, 0.9, 'sawtooth', 0.09, 0.5); noise(0.7, 0.15, 300, 0.7); },
    key: () => { noise(0.02, 0.12, 4000, 3); },
    flip: () => { noise(0.12, 0.12, 2400, 0.7); },
    on: () => { tone(660, 0.12, 'sine', 0.08); tone(990, 0.16, 'sine', 0.06, 0, 0.07); }
  };

  window.UISound = {
    get on() { return on; },
    set(v) {
      on = !!v;
      if (on) { start(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
      else if (hum && ctx) hum.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
    play(name, arg) { if (!on || !ctx || !CUES[name]) return; try { CUES[name](arg); } catch (err) { /* sound is optional */ } },
    hum(level) { if (!on || !hum) return; hum.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.05, ctx.currentTime, 0.4); }
  };
})();
