import { describe, expect, it } from 'vitest';
import { epilogue } from './endings';
import { STEP } from './loop';
import {
  bands,
  breakOptions,
  homeTalk,
  homeTalkOptions,
  letterTonight,
  meets,
  quotaFor,
  reduce,
  streakMultiplier,
} from './reducer';
import { type GameState, initialState } from './state';
import { TUNING as T } from './tuning';

const fresh = (seed = 1) => reduce(initialState(seed), { type: 'newGame', seed });
const start = (seed = 1) => reduce(fresh(seed), { type: 'advance' });
const at = (s: GameState, patch: Partial<GameState>): GameState => ({ ...s, ...patch });
const advance = (s: GameState) => reduce(s, { type: 'advance' });
const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9 && s.scene === 'shift'; t += STEP) s = reduce(s, { type: 'tick', dt: STEP });
  return s;
};
const finishShift = (s: GameState, good: number) => run(at(s, { today: { good, amber: 0, scrap: 0 } }), T.shiftLength);
/** A shift that starts in a given week and shift, through the scenes that lead to it. */
const shiftIn = (week: number, shift: number, seed = 1) => at(start(seed), { week, shift });
const onBand = (s: GameState, i = 0): GameState => ({ ...s, press: { ...s.press, needle: bands(s)[i].center } });

describe('week start', () => {
  it('opens every new game, and every new week, before the first shift', () => {
    expect(fresh().scene).toBe('weekStart');
    let s = at(start(), { shift: 3 });
    s = advance(finishShift(s, quotaFor(1))); // report → evening
    s = advance(s); // evening → week report
    expect(s.scene).toBe('weekReport');
    s = advance(s);
    expect(s.scene).toBe('weekStart');
    expect(s.week).toBe(2);
    expect(advance(s).scene).toBe('shift');
  });

  it('shows lines only when their condition holds', () => {
    const s = initialState(1);
    expect(meets(s, { flag: 'ingeIll' })).toBe(false);
    expect(meets(at(s, { flags: { ingeIll: true } }), { flag: 'ingeIll' })).toBe(true);
    expect(meets(at(s, { household: 50 }), { householdBelow: 70 })).toBe(true);
    expect(meets(at(s, { clues: ['C5'] }), { clue: ['C2', 'C5'] })).toBe(true);
    expect(meets(s, { clue: ['C2'] })).toBe(false);
  });
});

describe('break scenes', () => {
  it('follow the first shift report of the week and must be answered', () => {
    let s = advance(finishShift(start(), quotaFor(1)));
    expect(s.scene).toBe('break');
    expect(advance(s)).toBe(s);
    s = reduce(s, { type: 'choose', sceneId: 'break', option: 'sit' });
    expect(s.trust.brandt).toBe(1);
    expect(s.story.breaks['1']).toBe('sit');
    expect(s.breakScene?.reply).toMatch(/Marine/);
    expect(advance(s).scene).toBe('evening');
  });

  it('can teach a clue in passing', () => {
    let s = advance(finishShift(shiftIn(2, 1), quotaFor(2)));
    expect(s.breakScene?.week).toBe(2);
    s = reduce(s, { type: 'choose', sceneId: 'break', option: 'listen' });
    expect(s.clues).toContain('C4');
    expect(s.knowledge).toBe(0.5);
    expect(s.trust.emil).toBe(1); // one conversation, one step of trust

  });

  it("skip Emil's scenes once he's gone", () => {
    const s = advance(finishShift(at(shiftIn(5, 1), { flags: { emilArrested: true } }), quotaFor(5)));
    expect(s.scene).toBe('evening');
  });

  it('come only once a week', () => {
    let s = advance(finishShift(start(), quotaFor(1)));
    s = advance(reduce(s, { type: 'choose', sceneId: 'break', option: 'walk' }));
    s = advance(s); // evening → shift 2
    s = advance(finishShift(at(s, { shift: 1 }), quotaFor(1)));
    expect(s.scene).toBe('evening');
  });
});

describe('evenings at home', () => {
  const evening = (week: number, shift: number, patch: Partial<GameState> = {}) => {
    let s = advance(finishShift(at(shiftIn(week, shift), patch), quotaFor(week)));
    if (s.scene === 'break') s = advance(reduce(s, { type: 'choose', sceneId: 'break', option: breakOptions(s).at(-1)!.id }));
    return s;
  };

  it("bring Karl's letters on the first evening of weeks 2, 4 and 6", () => {
    expect(letterTonight(evening(1, 1))).toBeNull();
    expect(letterTonight(evening(2, 1))?.lines.join(' ')).toMatch(/Schlamm/);
    expect(letterTonight(evening(2, 2))).toBeNull();
    expect(evening(4, 1).flags.letter4).toBe(true);
  });

  it('hold a talk on the second evening, answered once', () => {
    let s = evening(2, 2);
    expect(homeTalk(s)?.speaker).toBe('Inge');
    expect(homeTalkOptions(s).map((o) => o.id)).toEqual(['machines', 'later']);
    s = reduce(s, { type: 'choose', sceneId: 'home', option: 'machines' });
    expect(s.story.talks['2']).toBe('machines');
    expect(reduce(s, { type: 'choose', sceneId: 'home', option: 'later' })).toBe(s);
  });

  it('offer the truth only to a player who has found it', () => {
    const s = evening(2, 2, { clues: ['C2'] });
    expect(homeTalkOptions(s).map((o) => o.id)).toContain('army');
  });

  it('carry through to the epilogue', () => {
    const base = initialState(1);
    const told = at(base, { flags: { letter2: true }, story: { talks: { '2': 'army' }, breaks: {} } });
    const lines = epilogue(told);
    expect(lines.some((l) => l.includes('Karl'))).toBe(true);
    expect(lines.some((l) => l.includes('Du hattest es ihr gesagt'))).toBe(true);
    const asked = epilogue(at(base, { story: { talks: { '2': 'later' }, breaks: {} } }));
    expect(asked.some((l) => l.includes('Teile'))).toBe(true);
  });
});

describe('Akkordserie', () => {
  it('raises the multiplier every five parts in a row, up to ×3', () => {
    expect([0, 4, 5, 10, 15, 20, 99].map(streakMultiplier)).toEqual([1, 1, 1.5, 2, 2.5, 3, 3]);
  });

  it('pays points by the multiplier, and scrap resets it', () => {
    let s = start();
    for (let i = 0; i < 5; i++) s = run(reduce(onBand(s), { type: 'press' }), T.pressStroke + STEP);
    expect(s.press.streak).toBe(5);
    expect(s.score).toBe(4 * 10 + 15);
    s = reduce({ ...s, press: { ...s.press, needle: s.press.bandCenter > 0.5 ? 0 : 1 } }, { type: 'press' });
    expect(s.press.streak).toBe(0);
    expect(s.score).toBe(55);
  });

  it("doesn't change pay", () => {
    let s = start();
    for (let i = 0; i < 10; i++) s = run(reduce(onBand(s), { type: 'press' }), T.pressStroke + STEP);
    s = run(s, T.shiftLength);
    expect(s.report?.pay).toBeCloseTo(10 * T.payPerPart);
  });
});

describe('part types', () => {
  it('keep week 1 on the standard part', () => {
    expect(start().partPlan).toEqual([{ at: 0, part: 'standard' }]);
  });

  it('change the die from week 2, with setup time away from the press', () => {
    let s = advance(advance(at(finishShift(shiftIn(1, 3), quotaFor(1)), {}))); // → evening → week report
    s = advance(advance(s)); // → week start → shift, week 2
    expect(s.week).toBe(2);
    expect(s.partPlan.length).toBe(2);
    const change = s.partPlan[1];
    s = run(s, change.at + STEP * 2);
    expect(s.press.part).toBe(change.part);
    expect(s.press.awayFor).toBe('setup');
  });

  it('give a double part two bands, either one good', () => {
    const s = at(start(), {});
    const d = { ...s, press: { ...s.press, part: 'double' as const } };
    expect(bands(d)).toHaveLength(2);
    expect(reduce(onBand(d, 1), { type: 'press' }).today.good).toBe(1);
    expect(bands(d)[0].width).toBeCloseTo(T.greenWidth * T.doubleWidthScale);
  });

  it('let a drifting band wander inside the gauge', () => {
    let s = start();
    s = { ...s, press: { ...s.press, part: 'drift' } };
    const c0 = s.press.bandCenter;
    s = run(s, 1);
    expect(s.press.bandCenter).not.toBeCloseTo(c0);
    s = run(s, 20);
    expect(s.press.bandCenter).toBeGreaterThanOrEqual(T.bandCenterMin);
    expect(s.press.bandCenter).toBeLessThanOrEqual(T.bandCenterMax);
  });
});

describe("Brandt's task", () => {
  const withTask = () => {
    const s = start();
    return at(s, { week: 2, task: { at: 1, need: 3, seconds: 10, start: 0, result: null, active: false } });
  };

  it('pays a bonus when met in time', () => {
    let s = run(withTask(), 1.1);
    expect(s.task?.active).toBe(true);
    const score = s.score;
    s = run(at(s, { today: { good: 3, amber: 0, scrap: 0 } }), STEP);
    expect(s.task?.result).toBe('won');
    expect(s.score).toBe(score + T.taskBonusPoints);
  });

  it('draws Attention when missed', () => {
    const s = run(withTask(), 12);
    expect(s.task?.result).toBe('lost');
    expect(s.attention).toBe(T.taskFailAttention);
  });
});

describe('blanks', () => {
  it('run out after a stack of presses, and stop the press', () => {
    let s = start();
    s = { ...s, press: { ...s.press, blanks: 1 } };
    s = run(reduce(onBand(s), { type: 'press' }), T.pressStroke + STEP);
    expect(s.press.blanks).toBe(0);
    const stuck = onBand(s);
    expect(reduce(stuck, { type: 'press' })).toBe(stuck);
  });

  it('are fetched in 2 seconds away from the press', () => {
    let s = start();
    s = { ...s, press: { ...s.press, blanks: 3 } };
    s = reduce(s, { type: 'fetchBlanks' });
    expect(s.press.awayFor).toBe('blanks');
    s = run(s, T.blanksSeconds + STEP);
    expect(s.press.blanks).toBe(T.blanksPerStack);
  });

  it("can't be fetched with a full stack", () => {
    const s = start();
    expect(reduce(s, { type: 'fetchBlanks' })).toBe(s);
  });
});
