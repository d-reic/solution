import { setSound, soundOn, unlockAudio } from '../audio';
import { $, type Dispatch, html, type View } from './view';

export function titleView(dispatch: Dispatch): View {
  const el = html(`
    <section class="title-screen">
      <h1 class="logo">SOLUTION</h1>
      <p class="meta">Werk 7 · Bench 14 · Autumn 1941</p>
      <p class="lead">You run a machine press. Each press makes one part. Your score is your output.</p>
      <ul class="rules">
        <li><b>PRESS</b><span>Press when the needle is in the green band. Click the red button, tap it, or hit Space.</span></li>
        <li><b>OIL</b><span>The press wears as you work. Oil it before it seizes. Oiling takes you away for 3 seconds.</span></li>
        <li><b>QUOTA</b><span>Forty parts a shift. Sixty seconds a shift.</span></li>
      </ul>
      <div class="title-actions">
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
  $(el, '[data-start]').onclick = () => {
    unlockAudio();
    dispatch({ type: 'newGame', seed: (Math.random() * 2 ** 32) >>> 0 });
  };

  return { el, update() {}, destroy() {} };
}
