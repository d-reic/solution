import { LINES, STORY } from './content';
import type { EndingId, GameState, Ledger } from './state';
import { TUNING as T } from './tuning';

/** Average parts per shift after knowing, as a share of those shifts' quotas. */
export function outputAfterKnowing(l: Ledger): number {
  return l.quotaAfterKnowing > 0 ? (l.goodAfterKnowing + l.amberAfterKnowing) / l.quotaAfterKnowing : 0;
}

/** "Knew" means knowledge 3+ with at least one shift worked after learning it. */
export function knew(state: GameState): boolean {
  return state.knowledge >= 3 && state.ledger.quotaAfterKnowing > 0;
}

/** The first matching row of the endings table in SPEC.md, top to bottom. */
export function resolveEnding(state: GameState): EndingId {
  const l = state.ledger;
  const k = knew(state);
  const out = outputAfterKnowing(l);
  const arrested = !!state.flags.arrested;
  const removed = arrested || !!state.flags.dismissed;
  const after = l.goodAfterKnowing + l.amberAfterKnowing;

  if (arrested && l.amber > 0) return 1;
  if (removed && k && out < 0.25) return 2;
  if (removed && !k) return 3;
  if (l.reported) return 4;
  if (!k) return 5;
  if (out < 0.1 && !arrested) return 6;
  if (after > 0 && l.amberAfterKnowing / after >= 0.3) return 7;
  if (out >= 0.9 && l.amber === 0) return 8;
  return 9;
}

export function isVictory(id: EndingId): boolean {
  return id === 4 || id === 5 || id === 8;
}

export function epilogue(state: GameState): string[] {
  const E = LINES.epilogue;
  const out: string[] = [];
  if (state.ledger.jakubFed >= 3) out.push(E.jakub);
  if (state.ledger.reported) out.push(E.emilReported);
  else if (state.ledger.coveredEmil > 0) out.push(E.emilCovered);
  if (state.flags.ingeIll) out.push(E.inge);
  if (!knew(state) && state.flags.crateSeen && !state.clues.includes('C2')) out.push(E.crate);
  // The family: Karl if his letters reached you, what Inge was told, how the winter sat with Lotte.
  const S = STORY.epilogue;
  if (state.flags.letter2) out.push(S.karl);
  const told = state.story.talks['2'];
  if (told) out.push(told === 'army' ? S.ingeTold : S.ingeAsked);
  if (state.household < 35 || state.flags.ingeIll) out.push(S.lotte);
  return out;
}

export function ledgerRows(state: GameState): [label: string, value: number][] {
  const l = state.ledger;
  const L = LINES.ledger;
  return [
    [L.parts, l.good + l.amber],
    [L.blocks, Math.floor(l.good / T.partsPerBreechBlock)],
    [L.failed, l.amber],
    [L.afterKnowing, l.goodAfterKnowing + l.amberAfterKnowing],
    [L.helped, l.jakubFed + l.coveredEmil],
    [L.reported, l.reported],
  ];
}

/** Rank among Werk 7's operators for a given output share. 1 is best. */
export function rankFor(parts: number, quota: number): number {
  const ratio = quota > 0 ? parts / quota : 0;
  const r = Math.round(T.operatorsOnWerk7 * (1 - Math.min(ratio, 1.3) / 1.3)) + 1;
  return Math.min(Math.max(r, 1), T.operatorsOnWerk7);
}
