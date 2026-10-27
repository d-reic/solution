import { TUNING as T } from './tuning';

export type Scene = 'title' | 'shift' | 'shiftReport' | 'evening' | 'office' | 'weekReport' | 'ending' | 'ledger';
export type CoworkerId = 'brandt' | 'emil' | 'greta' | 'jakub' | 'lotte';
export type PressResult = 'good' | 'amber' | 'scrap';
export type Bill = 'rent' | 'food' | 'coal' | 'medicine';
export type AwayFor = 'oil' | 'ask' | 'look' | 'talk' | 'bread' | 'cover';
export type OfficeId = 'warning' | 'statement';
export type EndingId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PressState {
  needle: number; // 0–1 across the gauge
  dir: 1 | -1; // which way the needle is sweeping
  speed: number; // gauge widths per second
  wear: number; // 0–100
  bandCenter: number; // centre of the green band, 0–1
  jammedUntil: number; // shift clock; 0 when not jammed
  awayUntil: number; // shift clock; 0 when at the press
  awayFor: AwayFor | null;
  readyAt: number; // shift clock when the ram is back up
  lastPress: { at: number; pos: number; result: PressResult } | null;
}

export interface ShiftReport {
  week: number;
  shift: number;
  good: number;
  amber: number;
  scrap: number;
  quota: number;
  met: boolean;
  points: number;
  pay: number;
  attentionBefore: number;
  attention: number;
  checks: number;
  caught: number;
  zero: boolean;
}

/** What happened this shift that the floor noticed. */
export interface ShiftLog {
  attentionStart: number;
  flagged: boolean; // anything that stops it being a quiet shift
  checks: number;
  caught: number;
  inspector: boolean; // an inspector at the bench all shift
  covered: boolean;
}

export interface WeekLog {
  good: number; // good + amber parts
  quota: number; // sum of quotas
  flagged: boolean;
}

export interface Evening {
  bills: Bill[]; // due tonight
  paying: Record<Bill, boolean>;
  bread: boolean;
}

export interface Office {
  id: OfficeId;
  read: boolean; // statement read (C11)
  reply: string | null; // set once the player has chosen
}

export interface WeekSummary {
  week: number;
  parts: number;
  quota: number; // sum of the week's quotas
  rank: number;
  nextQuota: number | null;
  quiet: boolean;
  gretaWord: boolean;
}

export interface Ledger {
  good: number;
  amber: number;
  goodAfterKnowing: number;
  amberAfterKnowing: number;
  quotaAfterKnowing: number; // sum of quotas for shifts after knowledge hit 3
  shiftKnowledgeHit3: [week: number, shift: number] | null;
  jakubFed: number;
  coveredEmil: number;
  reported: 0 | 1;
}

export interface GameState {
  seed: number;
  rng: number; // current PRNG state
  scene: Scene;
  week: number; // 1–6
  shift: number; // 1–3
  clock: number; // seconds into the current shift
  score: number; // the visible, dishonest number
  money: number; // Reichsmarks
  attention: number; // 0–100, visible
  knowledge: number; // 0–4, hidden
  household: number; // 0–100
  press: PressState;
  today: { good: number; amber: number; scrap: number };
  shiftLog: ShiftLog;
  weekLog: WeekLog;
  report: ShiftReport | null;
  evening: Evening | null;
  office: Office | null;
  weekSummary: WeekSummary | null;
  /** Lines said on the floor this shift, oldest first. Cleared at each shift. */
  feed: string[];
  zeroShifts: number;
  quotaWorked: number; // sum of quotas over every shift worked, for the final rank
  ending: EndingId | null;
  trust: Record<CoworkerId, number>;
  clues: string[];
  /** e.g. reportedEmil, emilArrested, ingeIll, ingeRecovered, hungry, breadWrapped, amberUnlocked,
   * arrested, dismissed, crateSeen, officeWarned, gretaReported */
  flags: Record<string, boolean>;
  ledger: Ledger;
}

export function initialState(seed: number): GameState {
  return {
    seed,
    rng: seed | 0,
    scene: 'title',
    week: 1,
    shift: 1,
    clock: 0,
    score: 0,
    money: T.startingMoney,
    attention: 0,
    knowledge: 0,
    household: 100,
    press: {
      needle: 0,
      dir: 1,
      speed: 0,
      wear: 0,
      bandCenter: 0.5,
      jammedUntil: 0,
      awayUntil: 0,
      awayFor: null,
      readyAt: 0,
      lastPress: null,
    },
    today: { good: 0, amber: 0, scrap: 0 },
    shiftLog: { attentionStart: 0, flagged: false, checks: 0, caught: 0, inspector: false, covered: false },
    weekLog: { good: 0, quota: 0, flagged: false },
    report: null,
    evening: null,
    office: null,
    weekSummary: null,
    feed: [],
    zeroShifts: 0,
    quotaWorked: 0,
    ending: null,
    trust: { brandt: 0, emil: 0, greta: 1, jakub: -1, lotte: 2 },
    clues: [],
    flags: {},
    ledger: {
      good: 0,
      amber: 0,
      goodAfterKnowing: 0,
      amberAfterKnowing: 0,
      quotaAfterKnowing: 0,
      shiftKnowledgeHit3: null,
      jakubFed: 0,
      coveredEmil: 0,
      reported: 0,
    },
  };
}
