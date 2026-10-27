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
