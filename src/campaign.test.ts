import { describe, expect, it } from 'vitest';
import { epilogue, ledgerRows, resolveEnding } from './endings';
import { STEP } from './loop';
import { type Action, floorClues, greenWidth, quotaFor, reduce } from './reducer';
import { type GameState, type Ledger, initialState } from './state';
import { TUNING as T } from './tuning';

const start = (seed = 1) => reduce(initialState(seed), { type: 'newGame', seed });
const at = (s: GameState, patch: Partial<GameState>): GameState => ({ ...s, ...patch });
const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9 && s.scene === 'shift'; t += STEP) s = reduce(s, { type: 'tick', dt: STEP });
  return s;
};
/** Ends the current shift with this many good parts. */
const finishShift = (s: GameState, good: number) => run(at(s, { today: { good, amber: 0, scrap: 0 } }), T.shiftLength);
const advance = (s: GameState) => reduce(s, { type: 'advance' });

describe('endings', () => {
  const base = initialState(1);
  const ledger = (l: Partial<Ledger>): Ledger => ({ ...base.ledger, ...l });
  const make = (opts: { knowledge?: number; flags?: Record<string, boolean>; ledger?: Partial<Ledger> }) =>
    at(base, { knowledge: opts.knowledge ?? 0, flags: opts.flags ?? {}, ledger: ledger(opts.ledger ?? {}) });
  const knewWith = (after: number, quota: number, extra: Partial<Ledger> = {}) =>
    ({ goodAfterKnowing: after, quotaAfterKnowing: quota, good: 400 + after, ...extra }) as Partial<Ledger>;

  it('1 · arrested for sabotage', () => {
    expect(resolveEnding(make({ flags: { arrested: true }, ledger: { amber: 4 } }))).toBe(1);
  });
  it('2 · refusal', () => {
    expect(resolveEnding(make({ knowledge: 3, flags: { dismissed: true }, ledger: knewWith(10, 200) }))).toBe(2);
  });
  it('3 · dismissed', () => {
    expect(resolveEnding(make({ knowledge: 1, flags: { dismissed: true } }))).toBe(3);
    expect(resolveEnding(make({ flags: { arrested: true } }))).toBe(3);
  });
  it('4 · the informer, whatever you knew', () => {
    expect(resolveEnding(make({ ledger: { reported: 1 } }))).toBe(4);
    expect(resolveEnding(make({ knowledge: 4, ledger: { ...knewWith(200, 200), reported: 1 } }))).toBe(4);
  });
  it('5 · the good German', () => {
    expect(resolveEnding(make({ knowledge: 2.5, ledger: { good: 700 } }))).toBe(5);
  });
  it('6 · stopped', () => {
    expect(resolveEnding(make({ knowledge: 3, ledger: knewWith(5, 300) }))).toBe(6);
  });
  it('7 · the quiet saboteur', () => {
    expect(resolveEnding(make({ knowledge: 3, ledger: knewWith(100, 300, { amberAfterKnowing: 80, amber: 80 }) }))).toBe(7);
  });
  it('8 · the efficient man', () => {
    expect(resolveEnding(make({ knowledge: 3.5, ledger: knewWith(290, 300) }))).toBe(8);
  });
  it('9 · the bare minimum', () => {
    expect(resolveEnding(make({ knowledge: 3, ledger: knewWith(150, 300) }))).toBe(9);
    // A few amber parts, but under 30%, with high output: not "efficient", not "saboteur".
    expect(resolveEnding(make({ knowledge: 3, ledger: knewWith(280, 300, { amberAfterKnowing: 10, amber: 10 }) }))).toBe(9);
  });
  it('reads near-zero output as stopping, not the minimum', () => {
    expect(resolveEnding(make({ knowledge: 3, ledger: knewWith(0, 300) }))).toBe(6);
  });

  it('adds epilogue lines in order', () => {
    const s = make({
      flags: { ingeIll: true, crateSeen: true },
      ledger: { jakubFed: 3, reported: 1 },
    });
    const lines = epilogue(s);
    expect(lines[0]).toMatch(/Jakub/);
    expect(lines[1]).toMatch(/Bank 9/);
    expect(lines[2]).toMatch(/Inge/);
    expect(lines[3]).toMatch(/Kisten/);
    expect(epilogue(make({ ledger: { jakubFed: 2 } }))).toEqual([]);
  });

  it('counts breech blocks as good parts ÷ 12', () => {
    const rows = ledgerRows(make({ ledger: { good: 125, amber: 7 } }));
    expect(rows[0][1]).toBe(132);
    expect(rows[1][1]).toBe(10);
    expect(rows[2][1]).toBe(7);
  });
});

describe('clues', () => {
  it('asking Brandt costs points, time and Attention, and never raises the score', () => {
    const s0 = start();
    const s = reduce(s0, { type: 'ask', who: 'brandt', clue: 'C1' });
    expect(s.score).toBe(s0.score - T.questionPenalty);
    expect(s.attention).toBe(T.attentionPerQuestion);
    expect(s.press.awayUntil).toBe(4);
    expect(s.clues).toContain('C1');
    expect(s.feed.at(-1)).toMatch(/Präzisionspassteile/);
  });

  it('shows the crate stencil from week 1, shift 2', () => {
    const s = start();
    expect(floorClues(s).map((c) => c.id)).not.toContain('C2');
    expect(floorClues(at(s, { shift: 2 })).map((c) => c.id)).toContain('C2');
  });

  it("only lets you read the circular while Brandt is out", () => {
    const s = at(start(), { week: 3 });
    expect(floorClues(at(s, { clock: 10 })).map((c) => c.id)).not.toContain('C7');
    const out = floorClues(at(s, { clock: 25 })).map((c) => c.id);
    expect(out).toContain('C7');
    expect(out).not.toContain('C1');
  });

  it('opens Emil up one conversation at a time', () => {
    let s = at(start(), { week: 2, shift: 2 });
    expect(floorClues(s).map((c) => c.id)).toEqual(expect.arrayContaining(['C4']));
    expect(floorClues(s).map((c) => c.id)).not.toContain('C5');
    s = run(reduce(s, { type: 'ask', who: 'emil', clue: 'C4' }), 5);
    s = run(reduce(s, { type: 'look', target: 'C2' }), 3);
    expect(floorClues(s).map((c) => c.id)).toContain('C5');
    s = run(reduce(s, { type: 'ask', who: 'emil', clue: 'C5' }), 5);
    expect(s.trust.emil).toBe(2);
    expect(s.knowledge).toBe(2.5);
  });

  it('records the shift knowledge reached 3, and counts parts from that shift on', () => {
    let s = at(start(), { week: 2, shift: 1, knowledge: 2.5, trust: { ...start().trust, emil: 1 }, clues: ['C2'] });
    s = reduce(s, { type: 'ask', who: 'emil', clue: 'C5' });
    expect(s.ledger.shiftKnowledgeHit3).toEqual([2, 1]);
    s = finishShift(s, 30);
    expect(s.ledger.goodAfterKnowing).toBe(30);
    expect(s.ledger.quotaAfterKnowing).toBe(quotaFor(2));
  });

  it('ignores a clue whose requirements are not met', () => {
    const s = start();
    expect(reduce(s, { type: 'ask', who: 'brandt', clue: 'C12' })).toBe(s);
  });
});

describe('amber parts', () => {
  const amberSpot = (s: GameState) => ({
    ...s,
    press: { ...s.press, needle: s.press.bandCenter + greenWidth(s) / 2 + T.amberWidth / 2 },
  });

  it('are scrap until Emil shows you, then score and pay like good parts', () => {
    const s = start();
    expect(reduce(amberSpot(s), { type: 'press' }).today.scrap).toBe(1);
    const u = reduce(amberSpot(at(s, { flags: { amberUnlocked: true } })), { type: 'press' });
    expect(u.today.amber).toBe(1);
    expect(u.score).toBe(T.pointsPerPart);
  });

  it('go on the ledger separately', () => {
    let s = at(start(), { flags: { amberUnlocked: true } });
    s = reduce(amberSpot(s), { type: 'press' });
    s = run(s, T.shiftLength);
    expect(s.ledger.amber).toBe(1);
    expect(s.ledger.good).toBe(0);
  });
});

describe('attention', () => {
  it('an empty crate draws a large gain, and two of them end the game', () => {
    let s = finishShift(start(), 0);
    expect(s.attention).toBe(T.attentionZeroShift);
    s = advance(advance(s));
    s = finishShift(s, 0);
    expect(s.flags.dismissed).toBe(true);
    s = advance(s);
    expect(s.scene).toBe('ending');
    expect(s.ending).toBe(3);
  });

  it('a quiet shift that meets quota lowers it', () => {
    const s = finishShift(at(start(), { attention: 30 }), quotaFor(1));
    expect(s.attention).toBe(30 + T.attentionQuotaMet + T.attentionQuietShift);
  });

  it('calls you to the office at 50', () => {
    let s = finishShift(at(start(), { attention: 49 }), 10);
    expect(s.attention).toBeGreaterThanOrEqual(T.officeAt);
    s = advance(s);
    expect(s.scene).toBe('office');
    expect(s.office?.id).toBe('warning');
    expect(advance(s)).toBe(s); // must answer first
    s = reduce(s, { type: 'choose', sceneId: 'office', option: 'promise' });
    expect(s.office?.reply).toBeTruthy();
    expect(advance(s).scene).toBe('evening');
  });

  it('puts an inspector at the bench at 80', () => {
    const s = advance(advance(at(finishShift(start(), quotaFor(1)), { attention: 85, flags: { officeWarned: true } })));
    expect(s.scene).toBe('shift');
    expect(s.shiftLog.inspector).toBe(true);
  });

  it('arrests at 100', () => {
    const s = advance(at(finishShift(start(), quotaFor(1)), { attention: 100 }));
    expect(s.scene).toBe('ending');
    expect(s.flags.arrested).toBe(true);
  });
});

describe('evenings', () => {
  const evening = (patch: Partial<GameState> = {}) => advance(finishShift(at(start(), patch), quotaFor(1)));

  it('bills food each evening and rent on the last evening of the week', () => {
    expect(evening().evening?.bills).toEqual(['food']);
    expect(evening({ shift: 3 }).evening?.bills).toEqual(['food', 'rent']);
    expect(evening({ week: 4 }).evening?.bills).toEqual(['food', 'coal']);
  });

  it('pays what it can by default and takes it from the wallet', () => {
    const s = evening();
    expect(s.evening?.paying.food).toBe(true);
    const after = advance(s);
    expect(after.money).toBeCloseTo(s.money - T.food);
  });

  it('skipping food saves money, hurts the household and narrows the band next shift', () => {
    let s = evening();
    s = reduce(s, { type: 'pay', bill: 'food' });
    expect(s.evening?.paying.food).toBe(false);
    const next = advance(s);
    expect(next.money).toBeCloseTo(s.money);
    expect(next.household).toBe(100 - T.householdLossPerBill);
    expect(greenWidth(next)).toBe(T.greenWidthNarrow);
  });

  it('Inge falls ill at zero household, and medicine is billed until paid', () => {
    let s = evening({ household: 10 });
    s = advance(reduce(s, { type: 'pay', bill: 'food' }));
    expect(s.flags.ingeIll).toBe(true);
    s = advance(finishShift(s, quotaFor(1)));
    expect(s.evening?.bills).toContain('medicine');
  });

  it('wrapping bread costs a food payment and lets you feed Jakub next shift', () => {
    let s = evening({ week: 4, money: 20 });
    s = reduce(s, { type: 'choose', sceneId: 'evening', option: 'bread' });
    const spent = s.money;
    s = advance(s);
    expect(s.money).toBeCloseTo(spent - T.food - T.coal - T.food);
    expect(s.flags.breadWrapped).toBe(true);
    s = reduce(s, { type: 'leaveBread' });
    expect(s.ledger.jakubFed).toBe(1);
    expect(s.trust.jakub).toBe(0);
    expect(s.flags.breadWrapped).toBe(false);
  });

  it('reading the newspaper in week 2 is free knowledge', () => {
    const s = reduce(evening({ week: 2 }), { type: 'choose', sceneId: 'evening', option: 'newspaper' });
    expect(s.clues).toContain('C3');
    expect(s.knowledge).toBe(0.5);
  });
});

describe('week 5 statement', () => {
  const statement = () => advance(finishShift(at(start(), { week: 5, shift: 2 }), quotaFor(5)));

  it('runs inside the second evening', () => {
    const s = statement();
    expect(s.scene).toBe('office');
    expect(s.office?.id).toBe('statement');
  });

  it('signing reports Emil for the loyalty bonus and a large Attention drop', () => {
    let s = at(statement(), { attention: 50 });
    const score = s.score;
    s = reduce(s, { type: 'choose', sceneId: 'office', option: 'sign' });
    expect(s.score).toBe(score + T.loyaltyBonus);
    expect(s.attention).toBe(10);
    expect(s.ledger.reported).toBe(1);
    expect(s.flags.emilArrested).toBe(true);
    s = advance(s);
    expect(s.scene).toBe('evening');
  });

  it('reading it first is free and records C11', () => {
    const s = reduce(statement(), { type: 'choose', sceneId: 'office', option: 'read' });
    expect(s.clues).toContain('C11');
    expect(s.office?.reply).toBeNull();
  });

  it('refusing costs Greta’s trust', () => {
    const s = reduce(statement(), { type: 'choose', sceneId: 'office', option: 'refuse' });
    expect(s.trust.greta).toBe(1 - 2);
    expect(s.ledger.reported).toBe(0);
  });
});

describe('covering for Emil', () => {
  it('is available from week 5, once a shift, and counts as help', () => {
    const s = at(start(), { week: 5 });
    const c = reduce(s, { type: 'coverEmil' });
    expect(c.ledger.coveredEmil).toBe(1);
    expect(c.press.awayFor).toBe('cover');
    expect(reduce(run(c, 4), { type: 'coverEmil' }).ledger.coveredEmil).toBe(1);
    const early = at(start(), { week: 4 });
    expect(reduce(early, { type: 'coverEmil' })).toBe(early);
  });
});

describe('a whole campaign', () => {
  // A scripted player: presses on a timetable, oils when hot, pays bills, asks one question.
  function script(seed: number): Action[] {
    const a: Action[] = [{ type: 'newGame', seed }];
    for (let shift = 0; shift < 18; shift++) {
      for (let f = 0; f < T.shiftLength * T.tickRate + 5; f++) {
        a.push({ type: 'tick', dt: STEP });
        if (f % 23 === 0) a.push({ type: 'press' });
        if (f % 1300 === 650) a.push({ type: 'oil' });
        if (shift === 1 && f === 100) a.push({ type: 'look', target: 'C2' });
      }
      // Report, maybe an office, evening, maybe a week report.
      for (let i = 0; i < 4; i++) {
        a.push({ type: 'choose', sceneId: 'office', option: 'silent' });
        a.push({ type: 'choose', sceneId: 'office', option: 'refuse' });
        a.push({ type: 'advance' });
      }
    }
    return a;
  }
  // Spare advances during a shift are no-ops, so the script stays aligned.
  const play = (seed: number) => script(seed).reduce(reduce, initialState(0));

  it('replays the same ledger and ending from the same seed', () => {
    const a = play(1941);
    const b = play(1941);
    expect(a.ledger).toEqual(b.ledger);
    expect(a.score).toBe(b.score);
    expect(a.ending).toBe(b.ending);
    expect(a.ledger.good).toBeGreaterThan(0);
  });
});
