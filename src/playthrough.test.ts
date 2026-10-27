import { describe, expect, it } from 'vitest';
import { STEP } from './loop';
import {
  type Action,
  away,
  bands,
  breakOptions,
  canCoverEmil,
  canFetchBlanks,
  canLeaveBread,
  floorClues,
  homeTalkOptions,
  inspectionMinimum,
  officeOptions,
  quotaFor,
  pressBlocked,
  reduce,
} from './reducer';
import { type EndingId, type GameState, initialState } from './state';
import { TUNING as T } from './tuning';

/**
 * Whole-campaign playthroughs with scripted players. Each bot presses with perfect timing,
 * so these check the flow (no scene gets stuck), the ending each play style reaches, and
 * the money over six weeks.
 */
interface Bot {
  /** How many parts to make this shift. */
  target(s: GameState): number;
  /** Press in the amber band instead of green, once it's unlocked. */
  amber?: boolean;
  /** Pick up clues on the floor. */
  learn?: boolean;
  feedJakub?: boolean;
  coverEmil?: boolean;
  /** Office reply ids, tried in order. */
  office?: string[];
}

interface Run {
  state: GameState;
  minMoney: number;
  minHousehold: number;
  maxAttention: number;
  unpaid: number;
  rentUnpaid: number; // weeks the rent went unpaid
}

const knows = (s: GameState) => s.knowledge >= 3;

function shiftActions(s: GameState, bot: Bot): Action[] {
  if (away(s)) return [];
  if (canFetchBlanks(s) && s.press.blanks <= 1) return [{ type: 'fetchBlanks' }];
  if (s.press.wear > 65) return [{ type: 'oil' }];
  if (bot.feedJakub && canLeaveBread(s)) return [{ type: 'leaveBread' }];
  if (bot.coverEmil && canCoverEmil(s) && s.clock > 40) return [{ type: 'coverEmil' }];
  if (bot.learn) {
    const c = floorClues(s).find((x) => x.id !== 'C1' || s.week === 1);
    if (c) {
      return [c.source.kind === 'look' ? { type: 'look', target: c.id } : { type: 'ask', who: c.source.who!, clue: c.id }];
    }
  }
  const parts = s.today.good + s.today.amber;
  if (pressBlocked(s) || parts >= bot.target(s)) return [];
  const useAmber = bot.amber && s.flags.amberUnlocked;
  for (const b of bands(s)) {
    const d = Math.abs(s.press.needle - b.center);
    const inGreen = d <= b.width / 2 - 0.01;
    const inAmber = d > b.width / 2 + 0.01 && d <= b.width / 2 + T.amberWidth - 0.01;
    if (useAmber ? inAmber : inGreen) return [{ type: 'press' }];
  }
  return [];
}

function play(bot: Bot, seed: number): Run {
  let s = reduce(initialState(seed), { type: 'newGame', seed });
  const run: Run = { state: s, minMoney: s.money, minHousehold: 100, maxAttention: 0, unpaid: 0, rentUnpaid: 0 };
  for (let guard = 0; guard < 500_000; guard++) {
    run.minMoney = Math.min(run.minMoney, s.money);
    run.minHousehold = Math.min(run.minHousehold, s.household);
    run.maxAttention = Math.max(run.maxAttention, s.attention);
    switch (s.scene) {
      case 'shift':
        for (const a of shiftActions(s, bot)) s = reduce(s, a);
        s = reduce(s, { type: 'tick', dt: STEP });
        break;
      case 'office': {
        const ids = officeOptions(s).map((o) => o.id);
        if (bot.learn && ids.includes('read') && !s.office?.read) {
          s = reduce(s, { type: 'choose', sceneId: 'office', option: 'read' });
          break;
        }
        const pick = (bot.office ?? []).find((id) => ids.includes(id)) ?? ids.find((id) => id !== 'read') ?? ids[0];
        s = reduce(reduce(s, { type: 'choose', sceneId: 'office', option: pick }), { type: 'advance' });
        break;
      }
      case 'break': {
        const opts = breakOptions(s);
        const pick = bot.learn ? opts[0] : opts[opts.length - 1];
        s = reduce(reduce(s, { type: 'choose', sceneId: 'break', option: pick.id }), { type: 'advance' });
        break;
      }
      case 'evening': {
        if (bot.learn) s = reduce(s, { type: 'choose', sceneId: 'evening', option: 'newspaper' });
        if (bot.feedJakub && !s.evening!.bread) s = reduce(s, { type: 'choose', sceneId: 'evening', option: 'bread' });
        const talk = homeTalkOptions(s);
        if (talk.length) s = reduce(s, { type: 'choose', sceneId: 'home', option: talk[talk.length - 1].id });
        run.unpaid += s.evening!.bills.filter((b) => !s.evening!.paying[b]).length;
        if (s.evening!.bills.includes('rent') && !s.evening!.paying.rent) run.rentUnpaid++;
        s = reduce(s, { type: 'advance' });
        break;
      }
      case 'ending':
      case 'ledger':
        run.state = s;
        return run;
      default:
        s = reduce(s, { type: 'advance' });
    }
  }
  throw new Error(`stuck in ${s.scene}, week ${s.week} shift ${s.shift}`);
}

const all = () => Infinity;
const BOTS: Record<string, { bot: Bot; ending: EndingId[] }> = {
  // Works flat out and never looks up.
  'good German': { bot: { target: all, office: ['silent', 'refuse'] }, ending: [5] },
  // Finds everything out and keeps the line running.
  'efficient man': { bot: { target: all, learn: true, office: ['silent', 'refuse'] }, ending: [8] },
  // Finds out, then makes the inspection minimum.
  'bare minimum': {
    bot: { target: (s) => (knows(s) ? inspectionMinimum(s.week) : Infinity), learn: true, office: ['silent', 'refuse'] },
    ending: [9],
  },
  // Finds out, then stops.
  refusal: { bot: { target: (s) => (knows(s) ? 0 : Infinity), learn: true, office: ['silent'] }, ending: [2, 6] },
  // Never presses at all.
  dismissed: { bot: { target: () => 0, office: ['silent', 'refuse'] }, ending: [3] },
  // Signs Greta's statement.
  informer: { bot: { target: all, office: ['sign', 'report'] }, ending: [4] },
  // Learns the amber band and uses it.
  saboteur: { bot: { target: all, learn: true, amber: true, office: ['silent', 'refuse'] }, ending: [7, 1] },
  // Feeds Jakub and covers for Emil, working full output.
  helper: { bot: { target: all, learn: true, feedJakub: true, coverEmil: true, office: ['silent', 'refuse'] }, ending: [8, 9] },
};

describe('whole-campaign playthroughs', () => {
  for (const [name, { bot, ending }] of Object.entries(BOTS)) {
    it(`${name} reaches ${ending.join(' or ')}`, () => {
      const r = play(bot, 1941);
      const s = r.state;
      // A line per bot, to read balance from the test output.
      console.log(
        `${name.padEnd(14)} ending ${s.ending}  week ${s.week}/${s.shift}  score ${s.score}  money ${s.money.toFixed(2)} (min ${r.minMoney.toFixed(2)})  household min ${r.minHousehold}  unpaid ${r.unpaid} (rent ${r.rentUnpaid})  attention max ${r.maxAttention}  parts ${s.ledger.good + s.ledger.amber}  amber ${s.ledger.amber}  fed ${s.ledger.jakubFed}  covered ${s.ledger.coveredEmil}`,
      );
      expect(ending).toContain(s.ending);
    });
  }

  // Balance targets from SPEC.md, with players who hit their number exactly.
  it('meeting quota exactly covers every bill with a little to spare', () => {
    const r = play({ target: (s) => quotaFor(s.week), office: ['silent', 'refuse'] }, 1941);
    console.log(`at quota       money ${r.state.money.toFixed(2)} (min ${r.minMoney.toFixed(2)})  unpaid ${r.unpaid}`);
    expect(r.unpaid).toBe(0);
    expect(r.state.money).toBeLessThan(25);
  });

  it('pressing only the inspection minimum leaves the rent unpaid most weeks', () => {
    const r = play({ target: (s) => inspectionMinimum(s.week), office: ['silent', 'refuse'] }, 1941);
    console.log(`at minimum     money ${r.state.money.toFixed(2)}  rent unpaid ${r.rentUnpaid}/6  household min ${r.minHousehold}  ending ${r.state.ending}`);
    expect(r.rentUnpaid).toBeGreaterThanOrEqual(4);
  });

  it('reach the same ending from the same seed', () => {
    expect(play(BOTS['bare minimum'].bot, 7).state.ledger).toEqual(play(BOTS['bare minimum'].bot, 7).state.ledger);
  });
});
