import { CLUES, type Clue, LINES, OFFICE_OPTIONS, type OfficeOption, clue as clueById } from './content';
import { rankFor, resolveEnding } from './endings';
import { nextRandom } from './rng';
import type { AwayFor, Bill, CoworkerId, GameState, PressResult, PressState, ShiftReport } from './state';
import { initialState } from './state';
import { TUNING as T } from './tuning';

export type Action =
  | { type: 'newGame'; seed: number }
  | { type: 'tick'; dt: number }
  | { type: 'press' }
  | { type: 'oil' }
  | { type: 'look'; target: string }
  | { type: 'ask'; who: string; clue: string }
  | { type: 'coverEmil' }
  | { type: 'leaveBread' }
  | { type: 'pay'; bill: Bill }
  | { type: 'choose'; sceneId: string; option: string }
  | { type: 'advance' };

// ---------- derived values ----------

export function quotaFor(week: number): number {
  return T.quotas[Math.min(Math.max(week, 1), T.weeks) - 1];
}

export function inspectionMinimum(week: number): number {
  return Math.ceil(quotaFor(week) * T.inspectionMinimum);
}

/** Needle speed in gauge widths per second. */
export function needleSpeed(week: number, clock: number): number {
  const w = (Math.min(Math.max(week, 1), T.weeks) - 1) / (T.weeks - 1);
  const sweep = T.sweepTimeWeek1 + (T.sweepTimeWeek6 - T.sweepTimeWeek1) * w;
  return (1 / sweep) * (1 + T.shiftSpeedup * Math.min(clock / T.shiftLength, 1));
}

export function greenWidth(state: GameState): number {
  return state.press.wear > T.narrowWearAbove || state.flags.hungry ? T.greenWidthNarrow : T.greenWidth;
}

/** True while the player can't use the press: jammed, away, or mid-stroke. */
export function pressBlocked(state: GameState): boolean {
  return state.scene !== 'shift' || away(state) || state.clock < state.press.readyAt;
}

/** Jammed, oiling, or off somewhere on the floor. */
export function away(state: GameState): boolean {
  return state.press.jammedUntil > 0 || state.press.awayUntil > 0;
}

export function windowOpen(state: GameState, name: 'brandtOut' | 'railCar'): boolean {
  const [from, to] = T[name];
  return state.scene === 'shift' && state.week >= 3 && state.clock >= from && state.clock < to;
}

export function emilPresent(state: GameState): boolean {
  return state.week >= 2 && !state.flags.emilArrested;
}

export function jakubPresent(state: GameState): boolean {
  return state.week >= 4;
}

/** Whether a clue's requirements are met right now (ignores whether the player is busy). */
export function clueAvailable(state: GameState, c: Clue): boolean {
  if (state.clues.includes(c.id)) return false;
  const a = c.available;
  if (a.weekMin && state.week < a.weekMin) return false;
  if (a.from && (state.week < a.from[0] || (state.week === a.from[0] && state.shift < a.from[1]))) return false;
  if (a.knowledgeMin && state.knowledge < a.knowledgeMin) return false;
  if (a.clues && !a.clues.every((id) => state.clues.includes(id))) return false;
  for (const [who, min] of Object.entries(a.trust ?? {})) {
    if (state.trust[who as CoworkerId] < (min as number)) return false;
  }
  if (a.window && !windowOpen(state, a.window)) return false;
  const who = c.source.who;
  if (who === 'emil' && !emilPresent(state)) return false;
  if (who === 'jakub' && !jakubPresent(state)) return false;
  // Brandt can't be asked while he's out of the office.
  if (who === 'brandt' && windowOpen(state, 'brandtOut')) return false;
  return true;
}

/** Clues the player can reach from the bench this moment. */
export function floorClues(state: GameState): Clue[] {
  if (state.scene !== 'shift') return [];
  return CLUES.filter((c) => c.source.kind !== 'read' && clueAvailable(state, c));
}

export function canLeaveBread(state: GameState): boolean {
  return state.scene === 'shift' && !!state.flags.breadWrapped && jakubPresent(state);
}

export function canCoverEmil(state: GameState): boolean {
  return state.scene === 'shift' && state.week >= 5 && emilPresent(state) && !state.shiftLog.covered;
}

export function officeOptions(state: GameState): OfficeOption[] {
  const o = state.office;
  if (!o) return [];
  if (o.id === 'statement') return OFFICE_OPTIONS.statement.filter((x) => !(x.read && o.read));
  const opts = [...OFFICE_OPTIONS.warning];
  if (state.week >= 5 && emilPresent(state) && !state.ledger.reported) {
    opts.splice(1, 0, OFFICE_OPTIONS.warningReport);
    opts.push(OFFICE_OPTIONS.warningDeny);
  }
  return opts;
}

export function billCost(bill: Bill): number {
  return bill === 'rent' ? T.rent : bill === 'food' ? T.food : bill === 'coal' ? T.coal : T.medicine;
}

/** What tonight's choices cost in total. */
export function eveningSpend(state: GameState): number {
  const e = state.evening;
  if (!e) return 0;
  const bills = e.bills.filter((b) => e.paying[b]).reduce((sum, b) => sum + billCost(b), 0);
  return round2(bills + (e.bread ? T.food : 0));
}

// ---------- reducer ----------

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'newGame':
      return beginShift(initialState(action.seed));
    case 'tick':
      return tick(state, action.dt);
    case 'press':
      return press(state);
    case 'oil':
      return oil(state);
    case 'look':
      return useClue(state, action.target, ['look']);
    case 'ask':
      return useClue(state, action.clue, ['ask', 'talk']);
    case 'leaveBread':
      return leaveBread(state);
    case 'coverEmil':
      return coverEmil(state);
    case 'pay':
      return togglePay(state, action.bill);
    case 'choose':
      return choose(state, action.sceneId, action.option);
    case 'advance':
      return advance(state);
    default:
      return state;
  }
}

// ---------- small helpers ----------

function random(state: GameState): [number, GameState] {
  const [r, rng] = nextRandom(state.rng);
  return [r, { ...state, rng }];
}

function newBandCenter(state: GameState): GameState {
  const [r, s] = random(state);
  return { ...s, press: { ...s.press, bandCenter: T.bandCenterMin + r * (T.bandCenterMax - T.bandCenterMin) } };
}

/** Raises or lowers Attention. Any rise counts against a quiet shift and a quiet week. */
function addAttention(state: GameState, delta: number): GameState {
  const attention = Math.min(T.arrestAt, Math.max(0, state.attention + delta));
  if (delta <= 0) return { ...state, attention };
  return {
    ...state,
    attention,
    shiftLog: { ...state.shiftLog, flagged: true },
    weekLog: { ...state.weekLog, flagged: true },
  };
}

function addKnowledge(state: GameState, amount: number): GameState {
  if (amount <= 0) return state;
  const knowledge = Math.min(4, state.knowledge + amount);
  const hit = state.knowledge < 3 && knowledge >= 3 && !state.ledger.shiftKnowledgeHit3;
  return {
    ...state,
    knowledge,
    ledger: hit ? { ...state.ledger, shiftKnowledgeHit3: [state.week, state.shift] } : state.ledger,
  };
}

function addTrust(state: GameState, deltas: Partial<Record<CoworkerId, number>>): GameState {
  const trust = { ...state.trust };
  for (const [who, d] of Object.entries(deltas)) {
    const k = who as CoworkerId;
    trust[k] = Math.min(3, Math.max(-3, trust[k] + (d as number)));
  }
  return { ...state, trust };
}

function say(state: GameState, line: string): GameState {
  return { ...state, feed: [...state.feed, line] };
}

function goAway(state: GameState, seconds: number, why: AwayFor): GameState {
  return { ...state, press: { ...state.press, awayUntil: state.clock + seconds, awayFor: why } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- shift ----------

function beginShift(state: GameState): GameState {
  let s: GameState = newBandCenter({
    ...state,
    scene: 'shift',
    clock: 0,
    today: { good: 0, amber: 0, scrap: 0 },
    report: null,
    evening: null,
    office: null,
    weekSummary: null,
    feed: [],
    shiftLog: {
      attentionStart: state.attention,
      flagged: false,
      checks: 0,
      caught: 0,
      inspector: state.attention >= T.inspectorAt,
      covered: false,
    },
    press: {
      ...state.press,
      needle: 0,
      dir: 1,
      speed: needleSpeed(state.week, 0),
      jammedUntil: 0,
      awayUntil: 0,
      awayFor: null,
      readyAt: 0,
      lastPress: null,
    },
  });
  if (s.shiftLog.inspector) s = say(s, LINES.events.inspector);
  if (s.flags.emilArrested && !s.flags.emilGoneSeen) {
    s = say({ ...s, flags: { ...s.flags, emilGoneSeen: true } }, LINES.events.emilGone);
  }
  if (s.trust.greta <= -3 && !s.flags.gretaReported) {
    s = say(addAttention({ ...s, flags: { ...s.flags, gretaReported: true } }, T.attentionGretaReports), LINES.events.gretaReports);
  }
  if (clueAvailable(s, clueById('C2'))) s = { ...s, flags: { ...s.flags, crateSeen: true } };
  return s;
}

function moveNeedle(needle: number, dir: 1 | -1, distance: number): [number, 1 | -1] {
  let n = needle + dir * distance;
  let d = dir;
  while (n > 1 || n < 0) {
    if (n > 1) {
      n = 2 - n;
      d = -1;
    } else {
      n = -n;
      d = 1;
    }
  }
  return [n, d];
}

function tick(state: GameState, rawDt: number): GameState {
  if (state.scene !== 'shift') return state;
  const dt = Math.min(Math.max(rawDt, 0), T.maxTickDt);
  // Summed 1/60 steps fall a hair short of 60, so snap the last one.
  const raw = state.clock + dt;
  const clock = raw >= T.shiftLength - 1e-6 ? T.shiftLength : raw;
  const speed = needleSpeed(state.week, clock);
  const [needle, dir] = moveNeedle(state.press.needle, state.press.dir, speed * dt);
  const press: PressState = { ...state.press, needle, dir, speed };

  if (press.jammedUntil > 0 && clock >= press.jammedUntil) {
    // The fitter frees the ram and resets the press.
    press.jammedUntil = 0;
    press.wear = 0;
  }
  if (press.awayUntil > 0 && clock >= press.awayUntil) {
    if (press.awayFor === 'oil') press.wear = 0;
    press.awayUntil = 0;
    press.awayFor = null;
  }

  const next = { ...state, clock, press };
  return clock >= T.shiftLength ? endShift(next) : next;
}

function press(state: GameState): GameState {
  if (pressBlocked(state)) return state;
  const p = state.press;
  const dist = Math.abs(p.needle - p.bandCenter);
  const half = greenWidth(state) / 2;
  let result: PressResult =
    dist <= half ? 'good' : state.flags.amberUnlocked && dist <= half + T.amberWidth ? 'amber' : 'scrap';
  const wear = Math.min(100, p.wear + T.wearPerPress);

  let s: GameState = newBandCenter({
    ...state,
    score: state.score + (result === 'scrap' ? 0 : T.pointsPerPart),
    press: {
      ...p,
      wear,
      jammedUntil: wear >= 100 ? state.clock + T.jamSeconds : 0,
      readyAt: state.clock + T.pressStroke,
    },
  });

  // Sample checks pull a finished part from the crate.
  if (result !== 'scrap' && s.week >= T.sampleChecksFromWeek) {
    const watched = s.shiftLog.inspector || s.attention >= T.inspectorAt;
    let r: number;
    [r, s] = random(s);
    if (r < (watched ? T.sampleChanceWatched : T.sampleChance)) {
      s = { ...s, shiftLog: { ...s.shiftLog, checks: s.shiftLog.checks + 1 } };
      if (s.shiftLog.checks === 1) s = say(s, LINES.events.sampleCheck);
      if (result === 'amber') {
        [r, s] = random(s);
        if (r < (s.attention >= T.inspectorAt ? T.amberCatchWatched : T.amberCatch)) {
          result = 'scrap';
          s = addAttention(s, T.attentionCaught);
          s = addTrust(s, { greta: -1 });
          s = say({ ...s, shiftLog: { ...s.shiftLog, caught: s.shiftLog.caught + 1 } }, LINES.events.caught);
        }
      }
    }
  }

  return {
    ...s,
    today: {
      good: s.today.good + (result === 'good' ? 1 : 0),
      amber: s.today.amber + (result === 'amber' ? 1 : 0),
      scrap: s.today.scrap + (result === 'scrap' ? 1 : 0),
    },
    press: { ...s.press, lastPress: { at: state.clock, pos: p.needle, result } },
  };
}

function oil(state: GameState): GameState {
  if (state.scene !== 'shift' || away(state) || state.press.wear === 0) return state;
  return goAway(state, T.oilSeconds, 'oil');
}

function useClue(state: GameState, id: string, kinds: string[]): GameState {
  const c = CLUES.find((x) => x.id === id);
  if (!c || !kinds.includes(c.source.kind) || state.scene !== 'shift' || away(state)) return state;
  if (!clueAvailable(state, c)) return state;
  let s: GameState = { ...state, score: state.score - c.cost.points, clues: [...state.clues, c.id] };
  if (c.cost.points > 0) {
    s = { ...s, shiftLog: { ...s.shiftLog, flagged: true }, weekLog: { ...s.weekLog, flagged: true } };
  }
  s = addAttention(s, c.cost.attention);
  s = addKnowledge(s, c.knowledge);
  if (c.trust) s = addTrust(s, c.trust);
  if (c.flags) s = { ...s, flags: { ...s.flags, ...c.flags } };
  s = goAway(s, c.cost.seconds, c.source.kind as AwayFor);
  return say(s, c.text);
}

function leaveBread(state: GameState): GameState {
  if (!canLeaveBread(state) || away(state)) return state;
  let s: GameState = {
    ...state,
    flags: { ...state.flags, breadWrapped: false },
    ledger: { ...state.ledger, jakubFed: state.ledger.jakubFed + 1 },
  };
  s = addTrust(s, { jakub: 1 });
  s = say(goAway(s, T.breadSeconds, 'bread'), LINES.events.bread);
  let r: number;
  [r, s] = random(s);
  if (r < T.breadSeenChance) {
    s = addTrust(addAttention(s, T.attentionBreadSeen), { greta: -1 });
    s = say(s, LINES.events.breadSeen);
  }
  return s;
}

function coverEmil(state: GameState): GameState {
  if (!canCoverEmil(state) || away(state)) return state;
  let s: GameState = {
    ...state,
    shiftLog: { ...state.shiftLog, covered: true },
    ledger: { ...state.ledger, coveredEmil: state.ledger.coveredEmil + 1 },
  };
  s = addTrust(s, { emil: 1 });
  s = say(goAway(s, T.coverSeconds, 'cover'), LINES.events.cover);
  let r: number;
  [r, s] = random(s);
  if (r < T.coverCatchChance) s = say(addAttention(s, T.attentionCoverCaught), LINES.events.coverCaught);
  return s;
}

function endShift(state: GameState): GameState {
  const quota = quotaFor(state.week);
  const { good, amber, scrap } = state.today;
  const parts = good + amber;
  const met = parts >= quota;
  const christmas = met && state.week === T.weeks && state.shift === T.shiftsPerWeek;
  const bonusPoints = (met ? T.quotaBonusPoints : 0) + (christmas ? T.christmasBonusPoints : 0);
  const pay = round2(parts * T.payPerPart + (met ? T.quotaBonusPay : 0) + (christmas ? T.christmasBonusPay : 0));
  const attentionBefore = state.shiftLog.attentionStart;

  let s: GameState = state;
  const zero = parts === 0;
  if (zero) {
    s = addAttention({ ...s, zeroShifts: s.zeroShifts + 1 }, T.attentionZeroShift);
  } else if (parts < inspectionMinimum(s.week)) {
    s = addAttention(s, T.attentionUnderMinimum);
  }
  if (met) {
    const beat = parts >= quota * T.quotaBeatShare;
    s = addAttention(s, beat ? T.attentionQuotaBeat : T.attentionQuotaMet);
    if (beat) s = addTrust(s, { greta: 1 });
  }
  if (!s.shiftLog.flagged) s = addAttention(s, T.attentionQuietShift);

  const known = s.knowledge >= 3;
  const ledger = {
    ...s.ledger,
    good: s.ledger.good + good,
    amber: s.ledger.amber + amber,
    goodAfterKnowing: s.ledger.goodAfterKnowing + (known ? good : 0),
    amberAfterKnowing: s.ledger.amberAfterKnowing + (known ? amber : 0),
    quotaAfterKnowing: s.ledger.quotaAfterKnowing + (known ? quota : 0),
  };

  const report: ShiftReport = {
    week: s.week,
    shift: s.shift,
    good,
    amber,
    scrap,
    quota,
    met,
    points: parts * T.pointsPerPart + bonusPoints,
    pay,
    attentionBefore,
    attention: s.attention,
    checks: s.shiftLog.checks,
    caught: s.shiftLog.caught,
    zero,
  };

  // A jam or an oiling cut short by the whistle is finished overnight.
  const p = s.press;
  const wear = p.jammedUntil > 0 || p.awayFor === 'oil' ? 0 : p.wear;

  return {
    ...s,
    scene: 'shiftReport',
    score: s.score + bonusPoints,
    money: round2(s.money + pay),
    report,
    ledger,
    weekLog: { ...s.weekLog, good: s.weekLog.good + parts, quota: s.weekLog.quota + quota },
    quotaWorked: s.quotaWorked + quota,
    press: { ...p, wear, jammedUntil: 0, awayUntil: 0, awayFor: null },
    flags: {
      ...s.flags,
      hungry: false, // it applied to this shift
      breadWrapped: false, // bread goes stale
      officeWarned: s.attention >= T.officeAt ? !!s.flags.officeWarned : false,
      dismissed: s.zeroShifts >= T.zeroShiftsToDismissal || !!s.flags.dismissed,
    },
  };
}

// ---------- between shifts ----------

function finish(state: GameState): GameState {
  const s = state.attention >= T.arrestAt ? { ...state, flags: { ...state.flags, arrested: true } } : state;
  return { ...s, scene: 'ending', ending: resolveEnding(s) };
}

function advance(state: GameState): GameState {
  const between = ['shiftReport', 'office', 'evening', 'weekReport'].includes(state.scene);
  if (between && (state.attention >= T.arrestAt || state.flags.dismissed)) return finish(state);

  switch (state.scene) {
    case 'shiftReport':
      if (state.attention >= T.officeAt && !state.flags.officeWarned) {
        return {
          ...state,
          scene: 'office',
          office: { id: 'warning', read: false, reply: null },
          flags: { ...state.flags, officeWarned: true },
        };
      }
      return openEvening(state);
    case 'office':
      if (!state.office?.reply) return state;
      return openEvening({ ...state, office: null });
    case 'evening':
      return closeEvening(state);
    case 'weekReport':
      if (state.week >= T.weeks) return finish(state);
      return beginShift({ ...state, week: state.week + 1, shift: 1, weekLog: { good: 0, quota: 0, flagged: false } });
    case 'ending':
      return { ...state, scene: 'ledger' };
    default:
      return state;
  }
}

function openEvening(state: GameState): GameState {
  // Week 5, second evening: Greta's statement comes first.
  if (state.week === 5 && state.shift === 2 && emilPresent(state) && !state.flags.statementDone && !state.ledger.reported) {
    return { ...state, scene: 'office', office: { id: 'statement', read: false, reply: null } };
  }
  const bills: Bill[] = ['food'];
  if (state.week >= T.coalFromWeek) bills.push('coal');
  if (state.shift === T.shiftsPerWeek) bills.push('rent');
  if (state.flags.ingeIll && !state.flags.ingeRecovered) bills.push('medicine');
  const paying = { rent: false, food: false, coal: false, medicine: false };
  let left = state.money;
  for (const b of bills) {
    const cost = billCost(b);
    if (cost <= left + 1e-9) {
      paying[b] = true;
      left -= cost;
    }
  }
  return { ...state, scene: 'evening', evening: { bills, paying, bread: false } };
}

function togglePay(state: GameState, bill: Bill): GameState {
  const e = state.evening;
  if (state.scene !== 'evening' || !e || !e.bills.includes(bill)) return state;
  const on = !e.paying[bill];
  if (on && eveningSpend(state) + billCost(bill) > state.money + 1e-9) return state;
  return { ...state, evening: { ...e, paying: { ...e.paying, [bill]: on } } };
}

function closeEvening(state: GameState): GameState {
  const e = state.evening!;
  const unpaid = e.bills.filter((b) => !e.paying[b]);
  let household = state.household - unpaid.length * T.householdLossPerBill;
  if (unpaid.length === 0) household += T.householdGainPaidUp;
  const flags: Record<string, boolean> = { ...state.flags, hungry: !e.paying.food, breadWrapped: e.bread };
  if (e.bills.includes('medicine') && e.paying.medicine) {
    flags.ingeRecovered = true;
    household = Math.max(household, T.householdAfterMedicine);
  }
  household = Math.min(100, Math.max(0, household));
  if (household <= 0 && !flags.ingeIll) flags.ingeIll = true;

  const s: GameState = { ...state, money: round2(state.money - eveningSpend(state)), household, flags, evening: null };
  if (s.shift < T.shiftsPerWeek) return beginShift({ ...s, shift: s.shift + 1 });
  return openWeekReport(s);
}

function openWeekReport(state: GameState): GameState {
  const quiet = !state.weekLog.flagged;
  const gretaWord = state.trust.greta >= 2;
  let s = state;
  if (quiet) s = addAttention(s, T.attentionQuietWeek);
  if (gretaWord) s = addAttention(s, T.attentionGretaWord);
  return {
    ...s,
    scene: 'weekReport',
    weekSummary: {
      week: s.week,
      parts: s.weekLog.good,
      quota: s.weekLog.quota,
      rank: rankFor(s.weekLog.good, s.weekLog.quota),
      nextQuota: s.week < T.weeks ? quotaFor(s.week + 1) : null,
      quiet,
      gretaWord,
    },
  };
}

function choose(state: GameState, sceneId: string, option: string): GameState {
  if (sceneId === 'evening') return chooseEvening(state, option);
  if (sceneId === 'office') return chooseOffice(state, option);
  return state;
}

function chooseEvening(state: GameState, option: string): GameState {
  const e = state.evening;
  if (state.scene !== 'evening' || !e) return state;
  if (option === 'newspaper') {
    const c = clueById('C3');
    if (!clueAvailable(state, c)) return state;
    return addKnowledge({ ...state, clues: [...state.clues, c.id] }, c.knowledge);
  }
  if (option === 'bread') {
    if (!jakubPresent(state)) return state;
    if (!e.bread && eveningSpend(state) + T.food > state.money + 1e-9) return state;
    return { ...state, evening: { ...e, bread: !e.bread } };
  }
  return state;
}

function chooseOffice(state: GameState, option: string): GameState {
  const o = state.office;
  if (state.scene !== 'office' || !o || o.reply) return state;
  const opt = officeOptions(state).find((x) => x.id === option);
  if (!opt) return state;

  if (opt.read) {
    const c = clueById(opt.read);
    return { ...state, clues: state.clues.includes(c.id) ? state.clues : [...state.clues, c.id], office: { ...o, read: true } };
  }

  let s: GameState = state;
  if (opt.attention) s = addAttention(s, opt.attention);
  if (opt.trust) s = addTrust(s, opt.trust);
  if (opt.report) {
    s = addAttention(
      {
        ...s,
        score: s.score + T.loyaltyBonus,
        ledger: { ...s.ledger, reported: 1 },
        flags: { ...s.flags, reportedEmil: true, emilArrested: true },
      },
      T.attentionReport,
    );
  }
  const flags = o.id === 'statement' ? { ...s.flags, statementDone: true } : s.flags;
  return { ...s, flags, office: { ...o, reply: opt.reply ?? '' } };
}
