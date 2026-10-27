import { nextRandom } from './rng';
import type { GameState, PressState, ShiftReport } from './state';
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
  | { type: 'pay'; bill: 'rent' | 'food' | 'coal' | 'medicine' }
  | { type: 'choose'; sceneId: string; option: string }
  | { type: 'advance' };

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
  return state.press.wear > T.narrowWearAbove ? T.greenWidthNarrow : T.greenWidth;
}

/** True while the player can't use the press: jammed, oiling, or mid-stroke. */
export function pressBlocked(state: GameState): boolean {
  const p = state.press;
  return state.scene !== 'shift' || p.jammedUntil > 0 || p.awayUntil > 0 || state.clock < p.readyAt;
}

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
    case 'advance':
      return advance(state);
    default:
      // Later milestones: look, ask, cover, bread, bills, office choices.
      return state;
  }
}

function newBandCenter(rng: number): [center: number, rng: number] {
  const [r, next] = nextRandom(rng);
  return [T.bandCenterMin + r * (T.bandCenterMax - T.bandCenterMin), next];
}

function beginShift(state: GameState): GameState {
  const [bandCenter, rng] = newBandCenter(state.rng);
  return {
    ...state,
    rng,
    scene: 'shift',
    clock: 0,
    today: { good: 0, amber: 0, scrap: 0 },
    report: null,
    press: {
      ...state.press,
      needle: 0,
      dir: 1,
      speed: needleSpeed(state.week, 0),
      bandCenter,
      jammedUntil: 0,
      awayUntil: 0,
      awayFor: null,
      readyAt: 0,
      lastPress: null,
    },
  };
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
  const good = Math.abs(p.needle - p.bandCenter) <= greenWidth(state) / 2;
  const [bandCenter, rng] = newBandCenter(state.rng);
  const wear = Math.min(100, p.wear + T.wearPerPress);

  return {
    ...state,
    rng,
    score: state.score + (good ? T.pointsPerPart : 0),
    today: {
      ...state.today,
      good: state.today.good + (good ? 1 : 0),
      scrap: state.today.scrap + (good ? 0 : 1),
    },
    press: {
      ...p,
      wear,
      bandCenter,
      jammedUntil: wear >= 100 ? state.clock + T.jamSeconds : 0,
      readyAt: state.clock + T.pressStroke,
      lastPress: { at: state.clock, pos: p.needle, result: good ? 'good' : 'scrap' },
    },
  };
}

function oil(state: GameState): GameState {
  const p = state.press;
  if (state.scene !== 'shift' || p.jammedUntil > 0 || p.awayUntil > 0 || p.wear === 0) return state;
  return { ...state, press: { ...p, awayUntil: state.clock + T.oilSeconds, awayFor: 'oil' } };
}

function endShift(state: GameState): GameState {
  const quota = quotaFor(state.week);
  const { good, scrap } = state.today;
  const met = good >= quota;
  const bonusPoints = met ? T.quotaBonusPoints : 0;
  const pay = round2(good * T.payPerPart + (met ? T.quotaBonusPay : 0));
  const report: ShiftReport = {
    week: state.week,
    shift: state.shift,
    good,
    scrap,
    quota,
    met,
    points: good * T.pointsPerPart + bonusPoints,
    pay,
  };
  // A jam or an oiling cut short by the whistle is finished overnight.
  const p = state.press;
  const wear = p.jammedUntil > 0 || p.awayFor === 'oil' ? 0 : p.wear;

  return {
    ...state,
    scene: 'shiftReport',
    score: state.score + bonusPoints,
    money: round2(state.money + pay),
    report,
    press: { ...p, wear, jammedUntil: 0, awayUntil: 0, awayFor: null },
    ledger: { ...state.ledger, good: state.ledger.good + good },
  };
}

function advance(state: GameState): GameState {
  if (state.scene !== 'shiftReport') return state;
  // M1: straight on to the next shift. The evening and week report arrive in M2.
  const lastShift = state.week >= T.weeks && state.shift >= T.shiftsPerWeek;
  if (lastShift) return { ...state, scene: 'title' };
  const nextWeek = state.shift >= T.shiftsPerWeek;
  return beginShift({
    ...state,
    week: nextWeek ? state.week + 1 : state.week,
    shift: nextWeek ? 1 : state.shift + 1,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
