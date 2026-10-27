import {
  CLUES,
  type Clue,
  type Condition,
  LINES,
  OFFICE_OPTIONS,
  type OfficeOption,
  STORY,
  type StoryOption,
  clue as clueById,
  fill,
} from './content';
import { rankFor, resolveEnding } from './endings';
import { nextRandom } from './rng';
import type { AwayFor, Bill, CoworkerId, GameState, PartType, PressResult, PressState, ShiftReport } from './state';
import { initialState } from './state';
import { TUNING as T } from './tuning';

export type Action =
  | { type: 'newGame'; seed: number }
  | { type: 'tick'; dt: number }
  | { type: 'press' }
  | { type: 'oil' }
  | { type: 'fetchBlanks' }
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

/** The green band(s) for the part in the die: centre and full width. */
export function bands(state: GameState): { center: number; width: number }[] {
  const w = greenWidth(state);
  const p = state.press;
  if (p.part === 'fine') return [{ center: p.bandCenter, width: w * T.fineWidthScale }];
  if (p.part === 'double') {
    return [
      { center: p.bandCenter, width: w * T.doubleWidthScale },
      { center: p.bandCenter2, width: w * T.doubleWidthScale },
    ];
  }
  return [{ center: p.bandCenter, width: w }];
}

/** Akkordserie: the points multiplier for a run of this many parts in a row. */
export function streakMultiplier(streak: number): number {
  return Math.min(T.streakMultMax, 1 + Math.floor(streak / T.streakStep) * T.streakMultStep);
}

/** True while the player can't use the press: jammed, away, mid-stroke, or out of blanks. */
export function pressBlocked(state: GameState): boolean {
  return state.scene !== 'shift' || away(state) || state.clock < state.press.readyAt || state.press.blanks <= 0;
}

/** Whether a story line or option applies. */
export function meets(state: GameState, c: Condition | undefined): boolean {
  if (!c) return true;
  if (c.flag && !state.flags[c.flag]) return false;
  if (c.householdBelow !== undefined && state.household >= c.householdBelow) return false;
  if (c.clue && !c.clue.some((id) => state.clues.includes(id))) return false;
  if (c.jakubFedAtLeast !== undefined && state.ledger.jakubFed < c.jakubFedAtLeast) return false;
  if (c.emilPresent !== undefined && emilPresent(state) !== c.emilPresent) return false;
  return true;
}

/** This week's break scene, if it applies and hasn't been played. */
export function breakFor(state: GameState) {
  const b = STORY.breaks[String(state.week)];
  return b && meets(state, b.if) && !(String(state.week) in state.story.breaks) ? b : null;
}

export function breakOptions(state: GameState): StoryOption[] {
  const b = STORY.breaks[String(state.breakScene?.week ?? state.week)];
  return b ? b.options.filter((o) => meets(state, o.if)) : [];
}

/** Tonight's talk at home, if there is one. */
export function homeTalk(state: GameState) {
  if (state.scene !== 'evening' || state.shift !== T.homeTalkEvening) return null;
  return STORY.homeTalks[String(state.week)] ?? null;
}

export function homeTalkOptions(state: GameState): StoryOption[] {
  return homeTalk(state)?.options.filter((o) => meets(state, o.if)) ?? [];
}

/** Karl's letter, if one arrives tonight. */
export function letterTonight(state: GameState) {
  if (state.scene !== 'evening' || state.shift !== T.letterEvening) return null;
  return STORY.letters[String(state.week)] ?? null;
}

export function canFetchBlanks(state: GameState): boolean {
  return state.scene === 'shift' && !away(state) && state.press.blanks < T.blanksPerStack;
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
      return openWeekStart(initialState(action.seed));
    case 'tick':
      return tick(state, action.dt);
    case 'press':
      return press(state);
    case 'oil':
      return oil(state);
    case 'fetchBlanks':
      return canFetchBlanks(state) ? goAway(state, T.blanksSeconds, 'blanks') : state;
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

/** Moves the green band(s) somewhere new: after every part, and on a part change. */
function newBandCenter(state: GameState): GameState {
  const span = T.bandCenterMax - T.bandCenterMin;
  const [r, s1] = random(state);
  const [r2, s] = random(s1);
  const bandCenter = T.bandCenterMin + r * span;
  // The second band sits a good way off the first, wrapping round inside the range.
  const bandCenter2 = T.bandCenterMin + ((bandCenter - T.bandCenterMin + span * (0.4 + r2 * 0.3)) % span);
  return { ...s, press: { ...s.press, bandCenter, bandCenter2 } };
}

/** Plans this shift's part changes and Brandt's task. Week 1 is plain work. */
function planShift(state: GameState): GameState {
  let s = state;
  const partPlan: { at: number; part: PartType }[] = [{ at: 0, part: 'standard' }];
  if (s.week >= T.partsFromWeek) {
    const kinds: PartType[] = s.week >= 3 ? ['fine', 'drift', 'double'] : ['fine', 'drift'];
    const times = s.week >= 4 ? [20, 40] : [30];
    for (const at of times) {
      let r: number;
      [r, s] = random(s);
      const prev = partPlan[partPlan.length - 1].part;
      const options = kinds.filter((k) => k !== prev);
      partPlan.push({ at, part: options[Math.floor(r * options.length)] });
    }
  }
  let task = null;
  if (s.week >= T.tasksFromWeek) {
    let r: number;
    [r, s] = random(s);
    const [from, to] = T.taskWindow;
    task = {
      at: from + r * (to - from),
      need: Math.round(T.taskNeedWeek2 + (s.week - 2) * T.taskNeedPerWeek),
      seconds: T.taskSeconds,
      start: 0,
      result: null,
      active: false,
    };
  }
  return { ...s, partPlan, task };
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
      streak: 0,
      part: 'standard',
      bandDir: 1,
      blanks: T.blanksPerStack,
      lastPress: null,
    },
  });
  s = planShift(s);
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
    if (press.awayFor === 'blanks') press.blanks = T.blanksPerStack;
    press.awayUntil = 0;
    press.awayFor = null;
  }
  if (press.part === 'drift') {
    // The band wanders, bouncing inside the usual range.
    let c = press.bandCenter + press.bandDir * T.driftSpeed * dt;
    if (c > T.bandCenterMax) [c, press.bandDir] = [2 * T.bandCenterMax - c, -1];
    if (c < T.bandCenterMin) [c, press.bandDir] = [2 * T.bandCenterMin - c, 1];
    press.bandCenter = c;
  }

  let next: GameState = { ...state, clock, press };
  next = changeParts(next, state.clock);
  next = runTask(next);
  return clock >= T.shiftLength ? endShift(next) : next;
}

/** A planned part change: new die, new bands, and a moment's setup away from the press. */
function changeParts(state: GameState, before: number): GameState {
  const due = state.partPlan.find((x) => x.at > before && x.at <= state.clock);
  if (!due || due.part === state.press.part) return state;
  let s: GameState = newBandCenter({ ...state, press: { ...state.press, part: due.part } });
  const p = s.press;
  s =
    p.awayUntil > 0
      ? { ...s, press: { ...p, awayUntil: p.awayUntil + T.setupSeconds } }
      : goAway(s, T.setupSeconds, 'setup');
  return say(s, LINES.events.parts[due.part as keyof typeof LINES.events.parts]);
}

/** Brandt's task: starts at its time, won when enough parts are in, lost when time runs out. */
function runTask(state: GameState): GameState {
  const t = state.task;
  if (!t || t.result) return state;
  const parts = state.today.good + state.today.amber;
  if (!t.active) {
    if (state.clock < t.at) return state;
    return say({ ...state, task: { ...t, active: true, start: parts } }, fill(LINES.events.task, { need: t.need, s: t.seconds }));
  }
  if (parts - t.start >= t.need) {
    return say(
      { ...state, score: state.score + T.taskBonusPoints, task: { ...t, active: false, result: 'won' } },
      LINES.events.taskWon,
    );
  }
  if (state.clock >= t.at + t.seconds || state.clock >= T.shiftLength) {
    return say(addAttention({ ...state, task: { ...t, active: false, result: 'lost' } }, T.taskFailAttention), LINES.events.taskLost);
  }
  return state;
}

function press(state: GameState): GameState {
  if (pressBlocked(state)) return state;
  const p = state.press;
  // The best result over the bands on the gauge.
  let result: PressResult = 'scrap';
  for (const b of bands(state)) {
    const dist = Math.abs(p.needle - b.center);
    if (dist <= b.width / 2) result = 'good';
    else if (result === 'scrap' && state.flags.amberUnlocked && dist <= b.width / 2 + T.amberWidth) result = 'amber';
  }
  const wear = Math.min(100, p.wear + T.wearPerPress);
  const streak = result === 'scrap' ? 0 : p.streak + 1;
  const points = result === 'scrap' ? 0 : Math.round(T.pointsPerPart * streakMultiplier(streak));

  let s: GameState = newBandCenter({
    ...state,
    score: state.score + points,
    press: {
      ...p,
      wear,
      streak,
      blanks: p.blanks - 1,
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
          s = { ...s, press: { ...s.press, streak: 0 } };
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
  const between = ['shiftReport', 'office', 'break', 'evening', 'weekReport'].includes(state.scene);
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
      return breakOrEvening(state);
    case 'office':
      if (!state.office?.reply) return state;
      return state.office.id === 'warning' ? breakOrEvening({ ...state, office: null }) : openEvening({ ...state, office: null });
    case 'break':
      if (!state.breakScene?.reply) return state;
      return openEvening({ ...state, breakScene: null });
    case 'weekStart':
      return beginShift(state);
    case 'evening':
      return closeEvening(state);
    case 'weekReport':
      if (state.week >= T.weeks) return finish(state);
      return openWeekStart({ ...state, week: state.week + 1, shift: 1, weekLog: { good: 0, quota: 0, flagged: false } });
    case 'ending':
      return { ...state, scene: 'ledger' };
    default:
      return state;
  }
}

function openWeekStart(state: GameState): GameState {
  return { ...state, scene: 'weekStart', weekSummary: null, report: null };
}

/** After a shift report: the week's break scene, if it's due, then home. */
function breakOrEvening(state: GameState): GameState {
  if (state.shift === T.breakAfterShift && breakFor(state)) {
    return { ...state, scene: 'break', breakScene: { week: state.week, reply: null } };
  }
  return openEvening(state);
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
  const letter = state.shift === T.letterEvening && STORY.letters[String(state.week)];
  const flags = letter ? { ...state.flags, [`letter${state.week}`]: true } : state.flags;
  return { ...state, flags, scene: 'evening', evening: { bills, paying, bread: false } };
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
  if (sceneId === 'break') return chooseBreak(state, option);
  if (sceneId === 'home') return chooseHome(state, option);
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

/** Applies a story answer's small effects: trust, Attention, a clue learned in passing. */
function applyStoryOption(state: GameState, opt: StoryOption): GameState {
  let s = state;
  if (opt.trust) s = addTrust(s, opt.trust);
  if (opt.attention) s = addAttention(s, opt.attention);
  // The clue's knowledge only: the reply's own trust already stands for the conversation.
  if (opt.clue && !s.clues.includes(opt.clue)) {
    const c = clueById(opt.clue);
    s = addKnowledge({ ...s, clues: [...s.clues, c.id] }, c.knowledge);
  }
  return s;
}

function chooseBreak(state: GameState, option: string): GameState {
  const b = state.breakScene;
  if (state.scene !== 'break' || !b || b.reply) return state;
  const opt = breakOptions(state).find((x) => x.id === option);
  if (!opt) return state;
  const s = applyStoryOption(state, opt);
  return {
    ...s,
    story: { ...s.story, breaks: { ...s.story.breaks, [String(b.week)]: opt.id } },
    breakScene: { ...b, reply: opt.reply },
  };
}

function chooseHome(state: GameState, option: string): GameState {
  const week = String(state.week);
  if (!homeTalk(state) || week in state.story.talks) return state;
  const opt = homeTalkOptions(state).find((x) => x.id === option);
  if (!opt) return state;
  const s = applyStoryOption(state, opt);
  return { ...s, story: { ...s.story, talks: { ...s.story.talks, [week]: opt.id } } };
}
