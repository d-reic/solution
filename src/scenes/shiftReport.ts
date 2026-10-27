import { LINES, WEEKS, fill, pick } from '../content';
import { inspectionMinimum } from '../reducer';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { $, type Dispatch, html, type View } from './view';

const rm = (n: number) => `${n.toFixed(2)} RM`;

export function shiftReportView(state: GameState, dispatch: Dispatch): View {
  const r = state.report!;
  const beat = r.good >= r.quota * 1.2;
  const kind = beat ? 'beat' : r.met ? 'met' : r.good >= inspectionMinimum(r.week) ? 'missed' : 'underMinimum';
  const line = fill(pick(LINES.shiftReport[kind], r.week * 3 + r.shift), { quota: r.quota, good: r.good });
  const last = r.week >= T.weeks && r.shift >= T.shiftsPerWeek;
  const month = WEEKS[r.week - 1]?.month ?? '';

  const el = html(`
    <section class="report">
      <p class="meta">${month} 1941 · Week ${r.week} · Shift ${r.shift}</p>
      <h2>END OF SHIFT</h2>
      <dl>
        <dt>Parts</dt><dd>${r.good}</dd>
        <dt>Scrap</dt><dd>${r.scrap}</dd>
        <dt>Quota</dt><dd>${r.quota} · ${r.met ? 'met' : 'missed'}</dd>
        <dt>Points</dt><dd>+${r.points.toLocaleString('en-US')}</dd>
        <dt>Pay</dt><dd>${rm(r.pay)}</dd>
        <dt>Score</dt><dd>${state.score.toLocaleString('en-US')}</dd>
      </dl>
      <p class="said" data-line></p>
      <button class="btn dark" type="button" data-next disabled>${last ? 'CLOCK OUT' : 'NEXT SHIFT'}</button>
    </section>`);
  $(el, '[data-line]').textContent = line;

  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });
  // A short pause, so a press mashed at the whistle doesn't skip the report.
  const timer = window.setTimeout(() => {
    next.disabled = false;
    next.focus();
  }, 700);

  return { el, update() {}, destroy: () => clearTimeout(timer) };
}
