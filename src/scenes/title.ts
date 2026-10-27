import { setSound, soundOn, unlockAudio } from '../audio';
import { $, type Dispatch, html, type View } from './view';

/** `onContinue` is set when there's a save to go back to. */
export function titleView(dispatch: Dispatch, onContinue: (() => void) | null): View {
  const el = html(`
    <section class="title-screen">
      <h1 class="logo">SOLUTION</h1>
      <p class="meta">Werk 7 · Bench 14 · Autumn 1941</p>
      <p class="lead">You run a machine press. Each press makes one part. Your score is your output.</p>
      <ul class="rules">
        <li><b>PRESS</b><span>Press when the needle is in the green band. Click the red button, tap it, or hit Space.</span></li>
        <li><b>OIL</b><span>The press wears as you work. Oil it before it seizes. Oiling takes you away for 3 seconds.</span></li>
        <li><b>QUOTA</b><span>Sixty seconds a shift, three shifts a week, six weeks. The Ministry sets the quota.</span></li>
        <li><b>HOME</b><span>Your pay keeps a family. Rent, food and, when winter comes, coal.</span></li>
      </ul>
      <div class="title-actions">
        <button class="btn" type="button" data-continue hidden>CONTINUE</button>
        <button class="btn" type="button" data-start>CLOCK IN</button>
        <button class="link" type="button" data-sound></button>
      </div>
      <p class="note">Set in a German factory in 1941. Contains references to war, forced labor and persecution.</p>
      <p class="note">Inspired by the game Sadie makes in Gabrielle Zevin's novel <i>Tomorrow, and Tomorrow, and Tomorrow</i>.</p>
    </section>`);

  const soundBtn = $(el, '[data-sound]');
  const showSound = () => (soundBtn.textContent = `Sound: ${soundOn() ? 'on' : 'off'}`);
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
    start.textContent = 'NEW GAME';
    start.classList.add('ghost');
  }

  return { el, update() {}, destroy() {} };
}
