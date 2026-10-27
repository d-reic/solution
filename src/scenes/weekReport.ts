import { LINES, WEEKS, fill } from '../content';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { rm } from './shiftReport';
import { $, type Dispatch, html, type View } from './view';

export function weekReportView(state: GameState, dispatch: Dispatch): View {
  const w = state.weekSummary!;
  const W = LINES.weekReport;
  const month = WEEKS[w.week - 1]?.month ?? '';
  const el = html(`
    <section class="report ministry">
      <p class="meta">Reich Ministry for Armaments · ${month} 1941</p>
      <h2>WEEK ${w.week} · WERK 7</h2>
      <dl>
        <dt>Output, bench 14</dt><dd>${w.parts} / ${w.quota}</dd>
        <dt>Rank on Werk 7</dt><dd>${w.rank} of ${T.operatorsOnWerk7}</dd>
        <dt>Score</dt><dd>${state.score.toLocaleString('en-US')}</dd>
        <dt>Wallet</dt><dd>${rm(state.money)}</dd>
        <dt>Attention</dt><dd>${Math.round(state.attention)}</dd>
      </dl>
      <p class="said" data-notes></p>
      <p class="slogan" data-slogan></p>
      <button class="btn dark" type="button" data-next>${w.nextQuota ? `WEEK ${w.week + 1}` : 'CONTINUE'}</button>
    </section>`);
  const notes: string[] = [];
  if (w.quiet) notes.push(W.quiet);
  if (w.gretaWord) notes.push(W.gretaWord);
  if (w.nextQuota) notes.push(fill(W.nextQuota, { quota: w.nextQuota }));
  $(el, '[data-notes]').textContent = notes.join(' ');
  $(el, '[data-slogan]').textContent = `“${W.propaganda[String(w.week) as keyof typeof W.propaganda]}”`;
  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });
  next.focus();
  return { el, update() {}, destroy() {} };
}
