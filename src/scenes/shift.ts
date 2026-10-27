import * as audio from '../audio';
import { LINES, WEEKS, pick } from '../content';
import { drawGauge, drawWear } from '../gauge';
import { greenWidth, quotaFor } from '../reducer';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { $, type Dispatch, html, type View } from './view';

export function shiftView(state: GameState, dispatch: Dispatch): View {
  const quota = quotaFor(state.week);
  const month = WEEKS[state.week - 1]?.month ?? '';
  const el = html(`
    <section class="shift">
      <header class="hud">
        <div><span class="lbl">${month} 1941</span><span class="val">Week ${state.week} · Shift ${state.shift}</span></div>
        <div class="hud-clock"><span class="lbl">Shift clock</span><div class="clockbar" role="progressbar" aria-label="Time into shift"><i data-clock></i></div></div>
        <div class="hud-score"><span class="lbl">Score</span><span class="val" data-score>0</span></div>
      </header>
      <div class="bench">
        <section class="machine">
          <div class="plate"><span class="stencil">PRESSE 14</span><span class="status" data-status aria-live="polite"></span></div>
          <canvas class="gauge" data-gauge aria-hidden="true"></canvas>
          <button class="press" type="button" data-press>PRESS<small>or Space</small></button>
          <div class="crate-row">
            <div class="crate" data-crate aria-hidden="true"></div>
            <div class="counts">
              <span><b data-good>0</b> / ${quota}</span>
              <span class="muted">Scrap <b data-scrap>0</b></span>
              <span class="muted" data-over></span>
            </div>
          </div>
        </section>
        <aside class="floor">
          <div class="wear">
            <div class="wear-dial"><canvas data-wear aria-hidden="true"></canvas><span class="lbl">Wear <b data-wearpct>0%</b></span></div>
            <button class="oil" type="button" data-oil>OIL<small>${T.oilSeconds} s away</small></button>
          </div>
          <div class="log" data-log></div>
        </aside>
      </div>
    </section>`);

  const crate = $(el, '[data-crate]');
  for (let i = 0; i < quota; i++) crate.appendChild(document.createElement('span'));
  const cells = Array.from(crate.children) as HTMLElement[];
  const pressBtn = $<HTMLButtonElement>(el, '[data-press]');
  const oilBtn = $<HTMLButtonElement>(el, '[data-oil]');
  const gauge = $<HTMLCanvasElement>(el, '[data-gauge]');
  const wearCanvas = $<HTMLCanvasElement>(el, '[data-wear]');
  const log = $(el, '[data-log]');

  const slip = (text: string) => {
    const d = document.createElement('p');
    d.className = 'slip';
    d.style.setProperty('--r', `${((log.childElementCount % 5) - 2) * 0.35}deg`);
    d.textContent = text;
    log.prepend(d);
    while (log.childElementCount > 8) log.lastElementChild!.remove();
  };
  const key = `${state.week}-${state.shift}` as keyof typeof LINES.shiftStart;
  const opening = LINES.shiftStart[key] ?? [pick(LINES.shiftStart.default, state.week * 3 + state.shift)];
  // The log is newest-first, so lay the opening lines down in reverse to read top to bottom.
  for (const line of [...opening].reverse()) slip(line);

  // Input. Presses dispatch straight from the event, so the result is on the next frame.
  const press = () => {
    audio.unlockAudio();
    dispatch({ type: 'press' });
  };
  pressBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press();
  });
  pressBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat) {
      e.preventDefault();
      press();
    }
  });
  oilBtn.addEventListener('click', () => dispatch({ type: 'oil' }));
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === 'KeyO' && !e.repeat) {
      dispatch({ type: 'oil' });
    }
  };
  const swallowSpace = (e: KeyboardEvent) => {
    if (e.code === 'Space') e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', swallowSpace);

  // What we last drew, to spot events (sounds, log lines) between updates.
  let seen = state;
  let hitTimer = 0;

  function events(s: GameState) {
    const p = s.press;
    const was = seen.press;
    if (p.lastPress && p.lastPress !== was.lastPress) {
      audio.clank(p.lastPress.result === 'good');
      pressBtn.classList.add('hit');
      clearTimeout(hitTimer);
      hitTimer = window.setTimeout(() => pressBtn.classList.remove('hit'), 70);
    }
    if (p.dir !== was.dir) audio.needleTick();
    if (p.jammedUntil > 0 && was.jammedUntil === 0) {
      audio.jam();
      slip(LINES.events.jam);
    }
    if (p.jammedUntil === 0 && was.jammedUntil > 0) slip(LINES.events.jamClear);
    if (p.awayFor === 'oil' && was.awayFor !== 'oil') slip(LINES.events.oil);
    if (p.wear > T.narrowWearAbove && was.wear <= T.narrowWearAbove) slip(LINES.events.wearHigh);
    if (s.today.good >= quota && seen.today.good < quota) slip(LINES.events.quotaMet);
  }

  function update(s: GameState) {
    if (s.scene !== 'shift') return;
    events(s);
    seen = s;
    const p = s.press;

    $(el, '[data-clock]').style.width = `${(s.clock / T.shiftLength) * 100}%`;
    $(el, '[data-score]').textContent = s.score.toLocaleString('en-US');
    $(el, '[data-good]').textContent = String(s.today.good);
    $(el, '[data-scrap]').textContent = String(s.today.scrap);
    $(el, '[data-over]').textContent = s.today.good > quota ? `+${s.today.good - quota} over quota` : '';
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i < s.today.good);
    $(el, '[data-wearpct]').textContent = `${Math.round(p.wear)}%`;

    let status = '';
    if (p.jammedUntil > 0) status = `JAMMED · fitter in ${Math.ceil(p.jammedUntil - s.clock)} s`;
    else if (p.awayFor === 'oil') status = `OILING · ${Math.ceil(p.awayUntil - s.clock)} s`;
    else if (p.lastPress && s.clock - p.lastPress.at < 0.6) status = p.lastPress.result === 'good' ? 'IN TOLERANCE' : 'SCRAP';
    const statusEl = $(el, '[data-status]');
    statusEl.textContent = status;
    statusEl.dataset.kind = p.jammedUntil > 0 || status === 'SCRAP' ? 'bad' : status ? 'ok' : '';

    const away = p.jammedUntil > 0 || p.awayUntil > 0;
    pressBtn.disabled = away;
    oilBtn.disabled = away || p.wear === 0;
    oilBtn.classList.toggle('urge', !away && p.wear > T.narrowWearAbove);

    drawGauge(gauge, {
      needle: p.needle,
      bandCenter: p.bandCenter,
      bandWidth: greenWidth(s),
      mark: p.lastPress ? { pos: p.lastPress.pos, good: p.lastPress.result === 'good', age: s.clock - p.lastPress.at } : null,
      idle: away,
    });
    drawWear(wearCanvas, p.wear, T.narrowWearAbove);
  }

  update(state);

  return {
    el,
    update,
    destroy() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', swallowSpace);
      clearTimeout(hitTimer);
    },
  };
}
