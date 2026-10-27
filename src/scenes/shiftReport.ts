import { LINES, WEEKS, fill, pick } from '../content';
import { inspectionMinimum } from '../reducer';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { $, type Dispatch, html, type View } from './view';

export const rm = (n: number) => `${n.toFixed(2)} RM`;

export function shiftReportView(state: GameState, dispatch: Dispatch): View {
  const r = state.report!;
  const parts = r.good + r.amber;
  const kind = r.zero
    ? 'zero'
    : parts >= r.quota * T.quotaBeatShare
      ? 'beat'
      : r.met
        ? 'met'
        : parts >= inspectionMinimum(r.week)
          ? 'missed'
          : 'underMinimum';
  const line = fill(pick(LINES.shiftReport[kind], r.week * 3 + r.shift), { quota: r.quota, good: parts });
  const month = WEEKS[r.week - 1]?.month ?? '';
  const delta = Math.round(r.attention - r.attentionBefore);

  const el = html(`
    <section class="report">
      <p class="meta">${month} 1941 · Week ${r.week} · Shift ${r.shift}</p>
      <h2>END OF SHIFT</h2>
      <dl>
        <dt>Parts</dt><dd>${parts}</dd>
        <dt>Scrap</dt><dd>${r.scrap}</dd>
        <dt>Quota</dt><dd>${r.quota} · ${r.met ? 'met' : 'missed'}</dd>
        <dt>Points</dt><dd>+${r.points.toLocaleString('en-US')}</dd>
        <dt>Pay</dt><dd>${rm(r.pay)}</dd>
        <dt>Attention</dt><dd>${Math.round(r.attention)} (${delta > 0 ? '+' : ''}${delta})</dd>
        <dt>Score</dt><dd>${state.score.toLocaleString('en-US')}</dd>
      </dl>
      <p class="said" data-line></p>
      <p class="note-line" data-note hidden></p>
      <button class="btn dark" type="button" data-next disabled>CONTINUE</button>
    </section>`);
  $(el, '[data-line]').textContent = line;

  const notes: string[] = [];
  if (r.checks > 0) notes.push(fill(LINES.shiftReport.inspectorNote, { checks: r.checks, caught: r.caught }));
  if (state.flags.dismissed) notes.push(LINES.shiftReport.zeroWarning);
  const note = $(el, '[data-note]');
  note.textContent = notes.join(' ');
  note.hidden = !notes.length;

  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });
  // A short pause, so a press mashed at the whistle doesn't skip the report.
  const timer = window.setTimeout(() => {
    next.disabled = false;
    next.focus();
  }, 700);

  return { el, update() {}, destroy: () => clearTimeout(timer) };
}
