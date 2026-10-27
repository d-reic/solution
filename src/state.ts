export type Scene = 'title' | 'shift' | 'shiftReport' | 'evening' | 'office' | 'weekReport' | 'ending' | 'ledger';
export type CoworkerId = 'brandt' | 'emil' | 'greta' | 'jakub' | 'lotte';
export type PressResult = 'good' | 'scrap';

export interface PressState {
  needle: number; // 0–1 across the gauge
  dir: 1 | -1; // which way the needle is sweeping
  speed: number; // gauge widths per second
  wear: number; // 0–100
  bandCenter: number; // centre of the green band, 0–1
  jammedUntil: number; // shift clock; 0 when not jammed
  awayUntil: number; // shift clock; 0 when at the press
  awayFor: 'oil' | null;
  readyAt: number; // shift clock when the ram is back up
  lastPress: { at: number; pos: number; result: PressResult } | null;
}

export interface ShiftReport {
  week: number;
  shift: number;
  good: number;
  scrap: number;
  quota: number;
  met: boolean;
  points: number;
  pay: number;
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
  report: ShiftReport | null;
  trust: Record<CoworkerId, number>;
  clues: string[];
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
    money: 0,
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
    report: null,
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
