import { LINES, UI, clue } from '../content';
import { emilPresent, officeOptions } from '../reducer';
import type { GameState } from '../state';
import { $, type Dispatch, html, type View } from './view';

export function officeView(state: GameState, dispatch: Dispatch): View {
  const id = state.office!.id;
  const O = LINES.office[id];
  const el = html(`
    <section class="office">
      <h2></h2>
      <p class="said" data-intro></p>
      <p class="said" data-intro2 hidden></p>
      <div class="document" data-doc hidden></div>
      <div class="replies" data-replies></div>
      <p class="said reply" data-reply hidden></p>
      <button class="btn dark" type="button" data-next hidden>${UI.office.continue}</button>
    </section>`);
  $(el, 'h2').textContent = O.title;
  $(el, '[data-intro]').textContent = O.intro;
  if (id === 'warning' && state.week >= 5 && emilPresent(state) && !state.ledger.reported) {
    const i2 = $(el, '[data-intro2]');
    i2.textContent = LINES.office.warning.inspectorIntro;
    i2.hidden = false;
  }

  const replies = $(el, '[data-replies]');
  replies.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-option]');
    if (b) dispatch({ type: 'choose', sceneId: 'office', option: b.dataset.option! });
  });
  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });

  let shown = '';
  function update(s: GameState) {
    const o = s.office;
    if (s.scene !== 'office' || !o) return;
    const doc = $(el, '[data-doc]');
    doc.hidden = !o.read;
    if (o.read) doc.textContent = clue('C11').text;

    const opts = o.reply === null ? officeOptions(s) : [];
    const k = opts.map((x) => x.id).join();
    if (k !== shown) {
      shown = k;
      // Every reply looks the same. The game doesn't point at the right one.
      replies.replaceChildren(
        ...opts.map((x) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'reply-btn';
          b.dataset.option = x.id;
          b.textContent = x.label;
          return b;
        }),
      );
    }
    const reply = $(el, '[data-reply]');
    reply.hidden = !o.reply;
    reply.textContent = o.reply ?? '';
    next.hidden = o.reply === null;
    if (o.reply !== null) next.focus();
  }

  update(state);
  return { el, update, destroy() {} };
}
