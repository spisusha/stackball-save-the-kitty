// Sounds are synthesized with WebAudio: no sound files, no rights issues, almost zero size.
// The AudioContext is created only after the first touch (ad network rule: no sound before interaction).
let ctx = null;
let master = null;
let muted = false;
const VOLUME = 0.5;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio is optional */ }
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : VOLUME; }
export function isMuted() { return muted; }
export function pauseAudio() { try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch { /* ignore */ } }
export function resumeAudio() { try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch { /* ignore */ } }

function tone({ f = 440, f2 = null, type = 'sine', dur = 0.12, vol = 0.3, delay = 0, attack = 0.005 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.15, vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', delay = 0, sweepTo = null }) {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.frequency.setValueAtTime(freq, t0); flt.Q.value = q;
  if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  smash(chain = 0) {
    const p = Math.min(chain, 20);
    noise({ dur: 0.07, vol: 0.35, freq: 1800 + p * 60, q: 1.2 });
    tone({ f: 260 + p * 22, f2: 180 + p * 15, type: 'triangle', dur: 0.08, vol: 0.18 });
  },
  bounce() { tone({ f: 170, f2: 90, type: 'sine', dur: 0.12, vol: 0.35 }); },
  fire() { noise({ dur: 0.6, vol: 0.4, freq: 300, q: 0.7, type: 'lowpass', sweepTo: 3000 }); tone({ f: 220, f2: 660, type: 'sawtooth', dur: 0.4, vol: 0.08 }); },
  fail() { noise({ dur: 0.45, vol: 0.5, freq: 900, q: 0.6, sweepTo: 200 }); tone({ f: 330, f2: 110, type: 'square', dur: 0.4, vol: 0.12 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.22, vol: 0.22, delay: i * 0.09 })); },
  thud() { tone({ f: 110, f2: 38, type: 'sine', dur: 0.28, vol: 0.55 }); noise({ dur: 0.22, vol: 0.35, freq: 260, q: 0.7, type: 'lowpass' }); },
  beep() { tone({ f: 880, type: 'square', dur: 0.07, vol: 0.08 }); },
  click() { tone({ f: 600, f2: 900, type: 'sine', dur: 0.06, vol: 0.15 }); },
  meow(delay = 0) {
    // Sawtooth through a band-pass "mouth", pitch goes up and down like "mi-aow"
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t0);
    o.frequency.linearRampToValueAtTime(820, t0 + 0.14);
    o.frequency.linearRampToValueAtTime(560, t0 + 0.42);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t0);
    f.frequency.linearRampToValueAtTime(1700, t0 + 0.15);
    f.frequency.linearRampToValueAtTime(1000, t0 + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    o.connect(f).connect(g).connect(master);
    o.start(t0); o.stop(t0 + 0.5);
  },
};
