import { STORY, WEEKS } from '../content';
import { meets } from '../reducer';
import type { GameState } from '../state';
import { $, type Dispatch, html, type View } from './view';

/** Monday morning before the week's first shift: the tram, the gate, the news. */
export function weekStartView(state: GameState, dispatch: Dispatch): View {
  const w = STORY.weekStart[String(state.week)];
  const month = WEEKS[state.week - 1]?.month ?? '';
  const el = html(`
    <section class="week-start">
      <p class="meta">${month} 1941</p>
      <h2 data-date></h2>
      <div class="morning" data-lines></div>
      <button class="btn" type="button" data-next>${STORY.ui.toWork}</button>
    </section>`);
  $(el, '[data-date]').textContent = w?.date ?? '';
  $(el, '[data-lines]').replaceChildren(
    ...(w?.lines ?? [])
      .filter((l) => meets(state, l.if))
      .map((l) => {
        const p = document.createElement('p');
        p.textContent = l.text;
        return p;
      }),
  );
  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });
  next.focus();
  return { el, update() {}, destroy() {} };
}
