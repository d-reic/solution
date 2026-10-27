import { STORY } from '../content';
import { breakOptions } from '../reducer';
import type { GameState } from '../state';
import { $, type Dispatch, html, type View } from './view';

/** The week's break: one coworker, a few replies. Built like the office scene. */
export function breakView(state: GameState, dispatch: Dispatch): View {
  const b = STORY.breaks[String(state.breakScene!.week)];
  const el = html(`
    <section class="office break">
      <h2></h2>
      <p class="said" data-intro></p>
      <div class="replies" data-replies></div>
      <p class="said reply" data-reply hidden></p>
      <button class="btn dark" type="button" data-next hidden>${STORY.ui.continue}</button>
    </section>`);
  $(el, 'h2').textContent = b.title;
  $(el, '[data-intro]').textContent = b.intro;

  const replies = $(el, '[data-replies]');
  replies.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-option]');
    if (btn) dispatch({ type: 'choose', sceneId: 'break', option: btn.dataset.option! });
  });
  const next = $<HTMLButtonElement>(el, '[data-next]');
  next.onclick = () => dispatch({ type: 'advance' });

  function update(s: GameState) {
    const scene = s.breakScene;
    if (s.scene !== 'break' || !scene) return;
    const answered = scene.reply !== null;
    replies.replaceChildren(
      ...(answered ? [] : breakOptions(s)).map((o) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reply-btn';
        btn.dataset.option = o.id;
        btn.textContent = o.label;
        return btn;
      }),
    );
    const reply = $(el, '[data-reply]');
    reply.hidden = !answered;
    reply.textContent = scene.reply ?? '';
    next.hidden = !answered;
    if (answered) next.focus();
  }

  update(state);
  return { el, update, destroy() {} };
}
