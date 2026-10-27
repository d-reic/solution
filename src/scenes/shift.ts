import * as audio from '../audio';
import { type Clue, LINES, UI, WEEKS, fill, num, pick } from '../content';
import { drawGauge, drawWear } from '../gauge';
import {
  away,
  bands,
  streakMultiplier,
  canCoverEmil,
  canLeaveBread,
  emilPresent,
  floorClues,
  jakubPresent,
  quotaFor,
  windowOpen,
} from '../reducer';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { $, type Dispatch, html, type View } from './view';

type Place = 'brandt' | 'crate' | 'yard' | 'emil' | 'jakub';

/** Which part of the floor a clue is found at. */
function placeOf(c: Clue): Place {
  if (c.source.who === 'brandt' || c.source.target === 'circular') return 'brandt';
  if (c.source.who === 'emil') return 'emil';
  if (c.source.who === 'jakub') return 'jakub';
  if (c.source.target === 'barracks') return 'yard';
  return 'crate';
}

const U = UI.shift;

export function shiftView(state: GameState, dispatch: Dispatch): View {
  const quota = quotaFor(state.week);
  const month = WEEKS[state.week - 1]?.month ?? '';
  const el = html(`
    <section class="shift">
      <header class="hud">
        <div><span class="lbl">${month} 1941</span><span class="val">${fill(U.week, { week: state.week, shift: state.shift })}</span></div>
        <div class="hud-clock"><span class="lbl">${U.clock}</span><div class="clockbar" role="progressbar" aria-label="${U.clockAria}"><i data-clock></i></div></div>
        <div class="lamp-wrap" title="${U.attention}"><span class="lamp" data-lamp aria-hidden="true"><i></i><i></i></span><span><span class="lbl">${U.attention}</span><span class="val" data-attention>0</span></span></div>
        <div class="hud-score"><span class="lbl">${U.score}</span><span class="val" data-score>0</span></div>
      </header>
      <div class="bench">
        <section class="machine">
          <div class="plate"><span class="stencil">PRESSE 14</span><span class="status" data-status aria-live="polite"></span></div>
          <div class="workpiece"><span data-part></span><span class="streak" data-streak></span></div>
          <p class="task" data-task hidden></p>
          <p class="inspector" data-inspector hidden>${U.inspector}</p>
          <canvas class="gauge" data-gauge aria-hidden="true"></canvas>
          <button class="press" type="button" data-press>${U.press}<small>${U.pressHint}</small></button>
          <div class="crate-row">
            <div class="crate" data-crate aria-hidden="true"></div>
            <div class="counts">
              <span><b data-good>0</b> / ${quota}</span>
              <span class="muted">${U.scrap} <b data-scrap>0</b></span>
              <span class="muted">${U.blanks} <b data-blanks>0</b></span>
              <span class="muted" data-over></span>
            </div>
          </div>
        </section>
        <aside class="floor">
          <div class="wear">
            <div class="wear-dial"><canvas data-wear aria-hidden="true"></canvas><span class="lbl">${U.wear} <b data-wearpct>0%</b></span></div>
            <button class="oil" type="button" data-oil>${U.oil}<small>${fill(U.awayShort, { s: T.oilSeconds })}</small></button>
            <button class="oil" type="button" data-fetch>${U.fetchBlanks}<small>${fill(U.awayShort, { s: T.blanksSeconds })}</small></button>
          </div>
          <div class="places" data-places></div>
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
  const places = $(el, '[data-places]');
  const log = $(el, '[data-log]');

  const slip = (text: string) => {
    const d = document.createElement('p');
    d.className = 'slip';
    d.style.setProperty('--r', `${((log.childElementCount % 5) - 2) * 0.35}deg`);
    d.textContent = text;
    log.prepend(d);
    while (log.childElementCount > 10) log.lastElementChild!.remove();
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
  const fetchBtn = $<HTMLButtonElement>(el, '[data-fetch]');
  fetchBtn.addEventListener('click', () => dispatch({ type: 'fetchBlanks' }));
  places.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    const [act, id] = b.dataset.act!.split(':');
    if (act === 'look') dispatch({ type: 'look', target: id });
    else if (act === 'ask') dispatch({ type: 'ask', who: b.dataset.who!, clue: id });
    else if (act === 'bread') dispatch({ type: 'leaveBread' });
    else if (act === 'cover') dispatch({ type: 'coverEmil' });
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === 'KeyO' && !e.repeat) {
      dispatch({ type: 'oil' });
    } else if (e.code === 'KeyR' && !e.repeat) {
      dispatch({ type: 'fetchBlanks' });
    }
  };
  const swallowSpace = (e: KeyboardEvent) => {
    if (e.code === 'Space') e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', swallowSpace);

  // What we last drew, to spot events (sounds, log lines) between updates.
  let seen = state;
  let feedShown = 0;
  let placesKey = '';
  let hitTimer = 0;

  function events(s: GameState) {
    const p = s.press;
    const was = seen.press;
    for (; feedShown < s.feed.length; feedShown++) slip(s.feed[feedShown]);
    if (p.lastPress && p.lastPress !== was.lastPress) {
      audio.clank(p.lastPress.result !== 'scrap');
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
    if (p.blanks <= T.blanksLow && was.blanks > T.blanksLow && p.blanks > 0) slip(LINES.events.blanksLow);
    if (p.blanks === 0 && was.blanks > 0) slip(LINES.events.blanksOut);
    const parts = s.today.good + s.today.amber;
    if (parts >= quota && seen.today.good + seen.today.amber < quota) slip(LINES.events.quotaMet);
    const out = windowOpen(s, 'brandtOut');
    if (out !== windowOpen(seen, 'brandtOut') && s.clock > 0) slip(out ? LINES.events.brandtOut : LINES.events.brandtBack);
    if (windowOpen(s, 'railCar') && !windowOpen(seen, 'railCar')) {
      slip(LINES.events.railCar);
      audio.trainWhistle();
    }
  }

  function renderPlaces(s: GameState) {
    const clues = floorClues(s);
    const busy = away(s);
    const bread = canLeaveBread(s);
    const cover = canCoverEmil(s);
    const brandtOut = windowOpen(s, 'brandtOut');
    const k = `${clues.map((c) => c.id).join()}|${bread}|${cover}|${busy}|${brandtOut}`;
    if (k === placesKey) return;
    placesKey = k;

    const F = LINES.floor;
    const titles: Record<Place, string> = {
      brandt: brandtOut ? F.brandtAway : F.brandt,
      crate: F.crate,
      yard: F.yard,
      emil: F.emil,
      jakub: F.jakub,
    };
    const groups = new Map<Place, HTMLButtonElement[]>([['brandt', []]]);
    const add = (place: Place, b?: HTMLButtonElement) => {
      if (!groups.has(place)) groups.set(place, []);
      if (b) groups.get(place)!.push(b);
    };
    const button = (label: string, cost: string, act: string, who?: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act';
      b.dataset.act = act;
      if (who) b.dataset.who = who;
      b.disabled = busy;
      b.append(label);
      const c = document.createElement('span');
      c.className = 'cost';
      c.textContent = cost;
      b.append(c);
      return b;
    };

    for (const c of clues) {
      const costs = [fill(U.away, { s: c.cost.seconds })];
      if (c.cost.points) costs.push(fill(U.points, { n: c.cost.points }));
      const act = c.source.kind === 'look' ? `look:${c.id}` : `ask:${c.id}`;
      add(placeOf(c), button(c.label, costs.join(' · '), act, c.source.who));
    }
    if (cover) add('emil', button(F.coverLabel, fill(U.away, { s: T.coverSeconds }), 'cover'));
    if (bread) add('jakub', button(F.breadLabel, fill(U.away, { s: T.breadSeconds }), 'bread'));
    // People on the floor stay visible even with nothing to say.
    if (emilPresent(s)) add('emil');
    if (jakubPresent(s)) add('jakub');

    places.replaceChildren(
      ...[...groups].map(([place, buttons]) => {
        const d = document.createElement('div');
        d.className = 'place';
        const h = document.createElement('h3');
        h.textContent = titles[place];
        d.append(h, ...buttons);
        if (!buttons.length) {
          const quiet = document.createElement('p');
          quiet.className = 'quiet';
          quiet.textContent = '—';
          d.append(quiet);
        }
        return d;
      }),
    );
  }

  function update(s: GameState) {
    if (s.scene !== 'shift') return;
    events(s);
    seen = s;
    const p = s.press;
    const parts = s.today.good + s.today.amber;

    $(el, '[data-clock]').style.width = `${(s.clock / T.shiftLength) * 100}%`;
    $(el, '[data-score]').textContent = num(s.score);
    $(el, '[data-attention]').textContent = String(Math.round(s.attention));
    const lamp = $(el, '[data-lamp]');
    lamp.style.setProperty('--glow', String(s.attention / 100));
    lamp.dataset.level = s.attention >= T.inspectorAt ? 'high' : s.attention >= T.officeAt ? 'mid' : '';
    $(el, '[data-inspector]').hidden = !s.shiftLog.inspector;
    $(el, '[data-good]').textContent = String(parts);
    $(el, '[data-scrap]').textContent = String(s.today.scrap);
    $(el, '[data-over]').textContent = parts > quota ? fill(U.over, { n: parts - quota }) : '';
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i < parts);
    $(el, '[data-wearpct]').textContent = `${Math.round(p.wear)}%`;

    let status = '';
    if (p.jammedUntil > 0) status = fill(U.jammed, { s: Math.ceil(p.jammedUntil - s.clock) });
    else if (p.awayFor) status = `${U.awayFor[p.awayFor]} · ${Math.ceil(p.awayUntil - s.clock)} s`;
    else if (p.blanks <= 0) status = U.noBlanks;
    else if (p.lastPress && s.clock - p.lastPress.at < 0.6) status = p.lastPress.result === 'scrap' ? U.scrapStatus : U.inTolerance;
    const statusEl = $(el, '[data-status]');
    statusEl.textContent = status;
    statusEl.dataset.kind = p.jammedUntil > 0 || status === U.scrapStatus || status === U.noBlanks ? 'bad' : status ? 'ok' : '';

    const busy = away(s);
    pressBtn.disabled = busy || p.blanks <= 0;
    fetchBtn.disabled = busy || p.blanks >= T.blanksPerStack;
    fetchBtn.classList.toggle('urge', !busy && p.blanks <= T.blanksLow);
    $(el, '[data-blanks]').textContent = String(p.blanks);
    $(el, '[data-part]').textContent = U.partNames[p.part];
    const mult = streakMultiplier(p.streak);
    const streakEl = $(el, '[data-streak]');
    streakEl.textContent = p.streak > 0 ? `${U.streak} ${p.streak} · ×${mult.toLocaleString('de-DE')}` : '';
    streakEl.dataset.hot = mult > 1 ? 'yes' : '';
    const task = s.task;
    const taskEl = $(el, '[data-task]');
    taskEl.hidden = !task?.active;
    if (task?.active) {
      taskEl.textContent = fill(U.task, {
        done: Math.min(parts - task.start, task.need),
        need: task.need,
        s: Math.max(0, Math.ceil(task.at + task.seconds - s.clock)),
      });
    }
    oilBtn.disabled = busy || p.wear === 0;
    oilBtn.classList.toggle('urge', !busy && p.wear > T.narrowWearAbove);
    renderPlaces(s);

    drawGauge(gauge, {
      needle: p.needle,
      bands: bands(s),
      amberWidth: s.flags.amberUnlocked ? T.amberWidth : 0,
      mark: p.lastPress ? { pos: p.lastPress.pos, result: p.lastPress.result, age: s.clock - p.lastPress.at } : null,
      idle: busy,
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
