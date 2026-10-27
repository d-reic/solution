import { LINES, UI, WEEKS, fill, num, rm } from '../content';
import { pieceRate } from '../reducer';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { $, type Dispatch, html, type View } from './view';

export function weekReportView(state: GameState, dispatch: Dispatch): View {
  const w = state.weekSummary!;
  const W = LINES.weekReport;
  const month = WEEKS[w.week - 1]?.month ?? '';
  const U = UI.week;
  const el = html(`
    <section class="report ministry">
      <p class="meta">${fill(U.meta, { month })}</p>
      <h2>${fill(U.title, { week: w.week })}</h2>
      <dl>
        <dt>${U.output}</dt><dd>${w.parts} / ${w.quota}</dd>
        <dt>${U.rank}</dt><dd>${fill(U.rankValue, { rank: w.rank, of: T.operatorsOnWerk7 })}</dd>
        <dt>${U.score}</dt><dd>${num(state.score)}</dd>
        <dt>${U.wallet}</dt><dd>${rm(state.money)}</dd>
        <dt>${U.attention}</dt><dd>${Math.round(state.attention)}</dd>
      </dl>
      <p class="said" data-notes></p>
      <p class="slogan" data-slogan></p>
      <button class="btn dark" type="button" data-next>${w.nextQuota ? fill(U.next, { week: w.week + 1 }) : U.continue}</button>
    </section>`);
  const notes: string[] = [];
  if (w.quiet) notes.push(W.quiet);
  if (w.gretaWord) notes.push(W.gretaWord);
  if (w.nextQuota) notes.push(fill(W.nextQuota, { quota: w.nextQuota, rate: rm(pieceRate(w.week + 1)) }));
  $(el, '[data-notes]').textContent = notes.join(' ');
  $(el, '[data-slogan]').textContent = `„${W.propaganda[String(w.week) as keyof typeof W.propaganda]}“`;
  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });
  next.focus();
  return { el, update() {}, destroy() {} };
}
