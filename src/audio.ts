// Small Web Audio synth: press clank, needle tick, jam, shift whistle. No music during shifts.
let ac: AudioContext | null = null;
let enabled = readSetting();

function readSetting(): boolean {
  try {
    return localStorage.getItem('solution.sound') !== 'off';
  } catch {
    return true;
  }
}

export function soundOn(): boolean {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('solution.sound', on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting lasts for this visit only.
  }
}

/** Call from a user gesture so the browser lets audio start. */
export function unlockAudio() {
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    ac = null;
  }
}

function ctx(): AudioContext | null {
  return enabled && ac && ac.state === 'running' ? ac : null;
}

function tone(type: OscillatorType, from: number, to: number, dur: number, vol: number, delay = 0) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  src.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export function clank(good: boolean) {
  tone('square', good ? 150 : 110, 55, 0.09, 0.12);
  noise(0.05, good ? 0.18 : 0.25, good ? 2400 : 900);
}

export function needleTick() {
  tone('square', 2200, 1800, 0.015, 0.015);
}

export function jam() {
  noise(0.6, 0.35, 500);
  tone('sawtooth', 90, 40, 0.5, 0.12);
}

export function whistle() {
  for (const [f, d] of [
    [740, 0],
    [880, 0],
  ] as const) {
    tone('sine', f, f * 0.98, 1.3, 0.07, d);
  }
}

/** Distant steam whistle as the goods wagon backs up. */
export function trainWhistle() {
  tone('sine', 520, 500, 0.9, 0.035);
  tone('sine', 655, 630, 0.9, 0.025);
}

/** The only music in the game: a tinny square-wave Wagner figure (public domain) for the victory screen. */
export function fanfare() {
  const a = ctx();
  if (!a) return;
  const N: Record<string, number> = { Fs4: 369.99, B4: 493.88, D5: 587.33, Fs5: 739.99, A5: 880, B5: 987.77 };
  const seq: [string, number][] = [
    ['Fs4', 0.12], ['B4', 0.36], ['Fs4', 0.12], ['B4', 0.12], ['D5', 0.36], ['B4', 0.12], ['D5', 0.12],
    ['Fs5', 0.36], ['D5', 0.12], ['Fs5', 0.12], ['A5', 0.72], ['Fs5', 0.12], ['A5', 0.12], ['B5', 0.36],
    ['A5', 0.12], ['Fs5', 0.12], ['D5', 0.36], ['B4', 0.12], ['Fs5', 0.12], ['B5', 1.1],
  ];
  let t = a.currentTime + 0.1;
  for (const [n, d] of seq) {
    for (const [type, mul, vol] of [['square', 1, 0.06], ['sawtooth', 0.5, 0.04]] as const) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = N[n] * mul;
      g.gain.setValueAtTime(vol, t);
      g.gain.setValueAtTime(vol, t + d * 0.8);
      g.gain.linearRampToValueAtTime(0, t + d * 0.98);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + d);
    }
    t += d;
  }
}
