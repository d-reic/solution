import { describe, expect, it } from 'vitest';
import { STEP, accumulate } from './loop';
import { type Action, breakOptions, greenWidth, needleSpeed, quotaFor, reduce } from './reducer';
import { nextRandom } from './rng';
import { type GameState, initialState } from './state';
import { TUNING as T } from './tuning';

// A new game opens on the week's start scene; one advance puts you at the press.
const start = (seed = 1) => reduce(reduce(initialState(seed), { type: 'newGame', seed }), { type: 'advance' });

/** Puts the needle exactly where we want it, without touching anything else. */
const needleAt = (s: GameState, needle: number): GameState => ({ ...s, press: { ...s.press, needle } });
const onBand = (s: GameState) => needleAt(s, s.press.bandCenter);
/** Pressing a blocked press changes nothing. */
const pressIgnored = (s: GameState) => expect(reduce(s, { type: 'press' })).toBe(s);
const offBand = (s: GameState) => needleAt(s, s.press.bandCenter > 0.5 ? 0 : 1);
const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP) s = reduce(s, { type: 'tick', dt: STEP });
  return s;
};

describe('rng', () => {
  it('replays the same sequence from the same seed', () => {
    const seq = (seed: number) => {
      const out: number[] = [];
      let st = seed;
      for (let i = 0; i < 5; i++) {
        const [v, next] = nextRandom(st);
        out.push(v);
        st = next;
      }
      return out;
    };
    expect(seq(42)).toEqual(seq(42));
    expect(seq(42)).not.toEqual(seq(43));
    for (const v of seq(7)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThan(1);
  });
});

describe('newGame', () => {
  it('starts week 1, shift 1 at the press', () => {
    const s = start();
    expect(s.scene).toBe('shift');
    expect([s.week, s.shift, s.clock, s.score]).toEqual([1, 1, 0, 0]);
    expect(s.press.bandCenter).toBeGreaterThanOrEqual(T.bandCenterMin);
    expect(s.press.bandCenter).toBeLessThanOrEqual(T.bandCenterMax);
  });
});

describe('press', () => {
  it('makes a good part in the green band', () => {
    const s = reduce(onBand(start()), { type: 'press' });
    expect(s.today).toEqual({ good: 1, amber: 0, scrap: 0 });
    expect(s.score).toBe(T.pointsPerPart);
    expect(s.press.lastPress?.result).toBe('good');
  });

  it('makes scrap outside the band, for no points', () => {
    const s = reduce(offBand(start()), { type: 'press' });
    expect(s.today).toEqual({ good: 0, amber: 0, scrap: 1 });
    expect(s.score).toBe(0);
  });

  it('treats the band edges as in tolerance', () => {
    const s0 = start();
    const edge = s0.press.bandCenter + greenWidth(s0) / 2 - 1e-9;
    expect(reduce(needleAt(s0, edge), { type: 'press' }).today.good).toBe(1);
    const out = s0.press.bandCenter + greenWidth(s0) / 2 + 0.01;
    expect(reduce(needleAt(s0, out), { type: 'press' }).today.scrap).toBe(1);
  });

  it('adds wear and moves the band', () => {
    const s0 = start();
    const s = reduce(onBand(s0), { type: 'press' });
    expect(s.press.wear).toBe(T.wearPerPress);
    expect(s.press.bandCenter).not.toBe(s0.press.bandCenter);
  });

  it('ignores a second press during the stroke', () => {
    const s1 = reduce(onBand(start()), { type: 'press' });
    pressIgnored(onBand(s1));
    const later = run(s1, T.pressStroke + STEP);
    expect(reduce(onBand(later), { type: 'press' }).today.good).toBe(2);
  });

  it('never lowers the score', () => {
    let s = start(9);
    for (let i = 0; i < 200; i++) {
      const before = s.score;
      s = reduce(i % 3 ? s : onBand(s), { type: 'press' });
      expect(s.score).toBeGreaterThanOrEqual(before);
      s = run(s, 0.25);
      if (s.scene !== 'shift') break;
    }
  });

  it('narrows the green band above 70% wear', () => {
    const s = start();
    expect(greenWidth({ ...s, press: { ...s.press, wear: 70 } })).toBe(T.greenWidth);
    expect(greenWidth({ ...s, press: { ...s.press, wear: 71 } })).toBe(T.greenWidthNarrow);
  });

  it('does nothing outside a shift', () => {
    const s = initialState(1);
    expect(reduce(s, { type: 'press' })).toBe(s);
  });
});

describe('wear, jam and oil', () => {
  const worn = (wear: number) => {
    const s = start();
    return { ...s, press: { ...s.press, wear } };
  };

  it('jams at 100% wear for 8 seconds, then the fitter resets it', () => {
    let s = reduce(onBand(worn(99)), { type: 'press' });
    expect(s.press.wear).toBe(100);
    expect(s.press.jammedUntil).toBeCloseTo(T.jamSeconds);
    s = run(s, 1);
    pressIgnored(onBand(s));
    s = run(s, T.jamSeconds - 1 + STEP);
    expect(s.press.jammedUntil).toBe(0);
    expect(s.press.wear).toBe(0);
  });

  it('oiling takes 3 seconds away from the press and resets wear', () => {
    let s = reduce(worn(60), { type: 'oil' });
    expect(s.press.awayFor).toBe('oil');
    pressIgnored(onBand(s));
    s = run(s, T.oilSeconds - STEP * 2);
    expect(s.press.wear).toBe(60);
    s = run(s, STEP * 3);
    expect(s.press.awayFor).toBeNull();
    expect(s.press.wear).toBe(0);
  });

  it('cannot oil a clean or jammed press', () => {
    const clean = start();
    expect(reduce(clean, { type: 'oil' })).toBe(clean);
    const jammed = reduce(onBand(worn(99)), { type: 'press' });
    expect(reduce(jammed, { type: 'oil' })).toBe(jammed);
  });
});

describe('tick', () => {
  it('sweeps the needle back and forth inside the gauge', () => {
    let s = start();
    let bounced = false;
    for (let i = 0; i < 200; i++) {
      s = reduce(s, { type: 'tick', dt: STEP });
      expect(s.press.needle).toBeGreaterThanOrEqual(0);
      expect(s.press.needle).toBeLessThanOrEqual(1);
      if (s.press.dir === -1) bounced = true;
    }
    expect(bounced).toBe(true);
  });

  it('takes 1.2 s per sweep in week 1 and gets 10% faster over a shift', () => {
    expect(1 / needleSpeed(1, 0)).toBeCloseTo(1.2);
    expect(1 / needleSpeed(6, 0)).toBeCloseTo(0.7);
    expect(needleSpeed(1, 60) / needleSpeed(1, 0)).toBeCloseTo(1.1);
  });

  it('clips long frames', () => {
    const s = reduce(start(), { type: 'tick', dt: 5 });
    expect(s.clock).toBe(T.maxTickDt);
  });

  it('ends the shift at 60 s with a report', () => {
    const s = run(start(), T.shiftLength);
    expect(s.scene).toBe('shiftReport');
    expect(s.clock).toBe(T.shiftLength);
    expect(s.report).toMatchObject({ week: 1, shift: 1, good: 0, met: false, pay: 0 });
  });

  it('pays the quota bonus when quota is met', () => {
    let s = start();
    s = { ...s, today: { ...s.today, good: quotaFor(1) }, score: quotaFor(1) * T.pointsPerPart };
    s = run(s, T.shiftLength);
    expect(s.report?.met).toBe(true);
    expect(s.score).toBe(quotaFor(1) * T.pointsPerPart + T.quotaBonusPoints);
    expect(s.money).toBeCloseTo(T.startingMoney + quotaFor(1) * T.payPerPart + T.quotaBonusPay);
    expect(s.ledger.good).toBe(quotaFor(1));
  });
});

describe('advance', () => {
  it('goes shift, report, evening, next shift; and a week report after shift 3', () => {
    let s = start();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(`${s.week}-${s.shift}`);
      s = { ...s, today: { ...s.today, good: quotaFor(s.week) } };
      s = run(s, T.shiftLength);
      expect(s.scene).toBe('shiftReport');
      s = reduce(s, { type: 'advance' });
      if (s.scene === 'break') {
        s = reduce(s, { type: 'choose', sceneId: 'break', option: breakOptions(s)[0].id });
        s = reduce(s, { type: 'advance' });
      }
      expect(s.scene).toBe('evening');
      s = reduce(s, { type: 'advance' });
      if (i === 2) {
        expect(s.scene).toBe('weekReport');
        s = reduce(s, { type: 'advance' });
        expect(s.scene).toBe('weekStart');
        s = reduce(s, { type: 'advance' });
      }
    }
    expect(seen).toEqual(['1-1', '1-2', '1-3', '2-1']);
    expect(s.scene).toBe('shift');
    expect(s.clock).toBe(0);
    expect(s.today.good).toBe(0);
  });
});

describe('fixed-step loop', () => {
  it('runs whole steps and carries the remainder', () => {
    expect(accumulate(0, STEP * 2.5).steps).toBe(2);
    expect(accumulate(STEP * 0.6, STEP * 0.5).steps).toBe(1);
    expect(accumulate(0, 10).steps).toBe(Math.floor(T.maxTickDt / STEP + 1e-9));
  });
});

describe('determinism', () => {
  // A scripted player: presses on a fixed timetable, oils when it runs hot.
  function script(): Action[] {
    const actions: Action[] = [{ type: 'newGame', seed: 1941 }, { type: 'advance' }];
    for (let shift = 0; shift < 3; shift++) {
      for (let f = 0; f < T.shiftLength * T.tickRate + 5; f++) {
        actions.push({ type: 'tick', dt: STEP });
        if (f % 37 === 0) actions.push({ type: 'press' });
        if (f % 1300 === 650) actions.push({ type: 'oil' });
        if (f % 900 === 450) actions.push({ type: 'fetchBlanks' });
      }
      for (const option of ['walk', 'careful']) actions.push({ type: 'choose', sceneId: 'break', option });
      actions.push({ type: 'advance' }, { type: 'advance' }, { type: 'advance' });
    }
    return actions;
  }
  const play = () => script().reduce(reduce, initialState(0));

  it('replays a scripted run to the same ledger', () => {
    const a = play();
    const b = play();
    expect(a.ledger).toEqual(b.ledger);
    expect(a.score).toBe(b.score);
    expect(a.ledger.good).toBeGreaterThan(0);
  });
});
