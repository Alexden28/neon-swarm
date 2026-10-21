// Procedural sound effects with the Web Audio API: no audio files to download.
// The context can only start after a user gesture, so `unlock()` is called from the Play button.
const VOLUME = 0.35;

// Minimum seconds between two plays of the same sound, so 100 hits in a frame don't clip.
const MIN_GAP = { shoot: 0.05, hit: 0.03, pickup: 0.035, kill: 0.04, enemyShoot: 0.08 };

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  const lastPlayed = new Map();

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function tone({ type = 'square', f0, f1 = f0, dur, vol = 0.2, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise({ dur, vol = 0.2, f0 = 2000, f1 = 200, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const sounds = {
    shoot: () => tone({ f0: 900 + Math.random() * 150, f1: 420, dur: 0.06, vol: 0.05 }),
    hit: () => noise({ dur: 0.05, vol: 0.1, f0: 3500, f1: 900 }),
    kill() {
      noise({ dur: 0.2, vol: 0.2, f0: 2600, f1: 120 });
      tone({ type: 'triangle', f0: 240, f1: 60, dur: 0.16, vol: 0.1 });
    },
    bossKill() {
      noise({ dur: 1.2, vol: 0.4, f0: 3000, f1: 40 });
      [196, 147, 98].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f / 2, dur: 0.5, vol: 0.15, delay: i * 0.18 }));
    },
    pickup: () => tone({ type: 'sine', f0: 700 + Math.random() * 200, f1: 1500, dur: 0.07, vol: 0.07 }),
    hurt() {
      tone({ type: 'sawtooth', f0: 320, f1: 60, dur: 0.28, vol: 0.18 });
      noise({ dur: 0.22, vol: 0.2, f0: 1500, f1: 100 });
    },
    dash: () => noise({ dur: 0.16, vol: 0.12, f0: 500, f1: 5000 }),
    levelup: () =>
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.12, delay: i * 0.07 })),
    select: () => tone({ type: 'triangle', f0: 880, f1: 1760, dur: 0.12, vol: 0.12 }),
    wave: () => [392, 523].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.06, delay: i * 0.1 })),
    boss: () =>
      [110, 104, 98].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: 0.45, vol: 0.16, delay: i * 0.3 })),
    burst: () => tone({ type: 'square', f0: 180, f1: 90, dur: 0.2, vol: 0.08 }),
    enemyShoot: () => tone({ type: 'triangle', f0: 340, f1: 200, dur: 0.1, vol: 0.05 }),
    gameover() {
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f * 0.98, dur: 0.3, vol: 0.14, delay: i * 0.2 }));
      noise({ dur: 0.8, vol: 0.3, f0: 2000, f1: 50 });
    },
  };

  return {
    unlock,
    play(name) {
      if (muted || !ctx || ctx.state !== 'running' || !sounds[name]) return;
      const gap = MIN_GAP[name] ?? 0;
      const now = ctx.currentTime;
      if (gap && now - (lastPlayed.get(name) ?? -Infinity) < gap) return;
      lastPlayed.set(name, now);
      sounds[name]();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : VOLUME;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
