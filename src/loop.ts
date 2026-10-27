import { TUNING as T } from './tuning';

export const STEP = 1 / T.tickRate;

/** How many fixed steps to run for this much elapsed time, and what's left over. */
export function accumulate(acc: number, elapsed: number): { steps: number; acc: number } {
  let a = acc + Math.min(Math.max(elapsed, 0), T.maxTickDt);
  let steps = 0;
  while (a >= STEP) {
    a -= STEP;
    steps++;
  }
  return { steps, acc: a };
}

/** Fixed 60 Hz simulation driven by requestAnimationFrame; renders once per frame. */
export function createLoop(step: (dt: number) => void, frame: () => void) {
  let acc = 0;
  let last = 0;
  let raf = 0;

  const onFrame = (now: number) => {
    const r = accumulate(acc, (now - last) / 1000);
    acc = r.acc;
    last = now;
    for (let i = 0; i < r.steps; i++) step(STEP);
    frame();
    raf = requestAnimationFrame(onFrame);
  };

  return {
    start() {
      if (raf) return;
      acc = 0;
      last = performance.now();
      raf = requestAnimationFrame(onFrame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
