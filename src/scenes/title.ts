import { setSound, soundOn, unlockAudio } from '../audio';
import { UI } from '../content';
import { $, type Dispatch, html, type View } from './view';

/** `onContinue` is set when there's a save to go back to. */
export function titleView(dispatch: Dispatch, onContinue: (() => void) | null): View {
  const U = UI.title;
  const el = html(`
    <section class="title-screen">
      <h1 class="logo">SOLUTION</h1>
      <p class="meta">${U.meta}</p>
      <p class="lead">${U.lead}</p>
      <ul class="rules">
        ${U.rules.map(([name, text]) => `<li><b>${name}</b><span>${text}</span></li>`).join('')}
      </ul>
      <div class="title-actions">
        <button class="btn" type="button" data-continue hidden>${U.continue}</button>
        <button class="btn" type="button" data-start>${U.start}</button>
        <button class="link" type="button" data-sound></button>
      </div>
      <p class="note">${U.note}</p>
      <p class="note">${U.credit}</p>
    </section>`);

  const soundBtn = $(el, '[data-sound]');
  const showSound = () => (soundBtn.textContent = soundOn() ? U.soundOn : U.soundOff);
  showSound();
  soundBtn.onclick = () => {
    setSound(!soundOn());
    showSound();
  };
  const start = $(el, '[data-start]');
  start.onclick = () => {
    unlockAudio();
    dispatch({ type: 'newGame', seed: (Math.random() * 2 ** 32) >>> 0 });
  };
  if (onContinue) {
    const cont = $(el, '[data-continue]');
    cont.hidden = false;
    cont.onclick = () => {
      unlockAudio();
      onContinue();
    };
    start.textContent = U.newGame;
    start.classList.add('ghost');
  }

  return { el, update() {}, destroy() {} };
}
