import { CLUES, LINES, STORY, UI, WEEKS, fill, rm } from '../content';
import { billCost, clueAvailable, eveningSpend, homeTalk, homeTalkOptions, jakubPresent, letterTonight } from '../reducer';
import type { Bill, GameState } from '../state';
import { TUNING as T } from '../tuning';
import { tableSvg } from './table';
import { $, type Dispatch, html, type View } from './view';

const level = (household: number) => (household >= 70 ? 'high' : household >= 35 ? 'mid' : 'low');

export function eveningView(state: GameState, dispatch: Dispatch): View {
  const month = WEEKS[state.week - 1]?.month ?? '';
  const U = UI.evening;
  const el = html(`
    <section class="evening">
      <p class="meta">${fill(U.meta, { month, week: state.week, shift: state.shift })}</p>
      <h2>${U.title}</h2>
      <div class="home">
        <div class="kitchen" data-kitchen>
          <div class="table" data-table aria-hidden="true"></div>
          <p data-scene></p>
          <p class="said" data-lotte></p>
          <p class="said" data-inge></p>
        </div>
        <div class="household">
          <div class="wallet"><span class="lbl">${U.wallet}</span><span class="val" data-wallet></span><span class="muted" data-left></span></div>
          <div class="bills" data-bills></div>
          <label class="toggle" data-bread-row hidden><input type="checkbox" data-bread /> <span>${LINES.evening.bread}</span><span class="price">${rm(T.food)}</span></label>
          <p class="short" data-short hidden>${U.short}</p>
        </div>
      </div>
      <div class="letter" data-letter hidden>
        <span class="lbl">${STORY.ui.letter}</span>
        <p class="from" data-from></p>
        <div data-letter-lines></div>
      </div>
      <div class="talk" data-talk hidden>
        <span class="lbl">${STORY.ui.talk}</span>
        <p class="said" data-talk-line></p>
        <div class="replies" data-talk-options></div>
        <p class="said reply" data-talk-reply hidden></p>
      </div>
      <div class="papers">
        <div class="paper">
          <span class="lbl">${U.newspaper}</span>
          <p data-news></p>
          <button class="link" type="button" data-read hidden>${U.read}</button>
        </div>
        <div class="notebook">
          <span class="lbl">${U.notebook}</span>
          <ul data-notebook></ul>
        </div>
      </div>
      <button class="btn" type="button" data-next>${state.shift >= T.shiftsPerWeek ? U.endWeek : U.bed}</button>
    </section>`);

  const bills = $(el, '[data-bills]');
  const e = state.evening!;
  for (const b of e.bills) {
    const row = html(`<label class="toggle"><input type="checkbox" data-bill="${b}" /> <span></span><span class="price">${rm(billCost(b))}</span></label>`);
    row.querySelector('span')!.textContent = LINES.evening.bills[b];
    bills.append(row);
  }
  // Ticking something the wallet can't cover stays possible to try: it explains instead of greying out.
  let current = state;
  const short = $(el, '[data-short]');
  const tryToggle = (input: HTMLInputElement, cost: number, action: Parameters<Dispatch>[0]) => {
    if (input.checked && eveningSpend(current) + cost > current.money + 1e-9) {
      input.checked = false;
      short.hidden = false;
      return;
    }
    short.hidden = true;
    dispatch(action);
  };
  bills.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    const bill = input.dataset.bill as Bill;
    tryToggle(input, billCost(bill), { type: 'pay', bill });
  });
  const breadInput = $<HTMLInputElement>(el, '[data-bread]');
  breadInput.addEventListener('change', () =>
    tryToggle(breadInput, T.food, { type: 'choose', sceneId: 'evening', option: 'bread' }),
  );
  $(el, '[data-read]').onclick = () => dispatch({ type: 'choose', sceneId: 'evening', option: 'newspaper' });
  $(el, '[data-next]').onclick = () => dispatch({ type: 'advance' });
  $(el, '[data-talk-options]').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-option]');
    if (b) dispatch({ type: 'choose', sceneId: 'home', option: b.dataset.option! });
  });

  // Karl's letter doesn't change during the evening, so it's laid out once.
  const letter = letterTonight(state);
  if (letter) {
    $(el, '[data-letter]').hidden = false;
    $(el, '[data-from]').textContent = letter.from;
    $(el, '[data-letter-lines]').replaceChildren(
      ...letter.lines.map((l) => {
        const p = document.createElement('p');
        p.textContent = l;
        return p;
      }),
    );
  }

  let drawnTable = '';
  function update(s: GameState) {
    const ev = s.evening;
    if (s.scene !== 'evening' || !ev) return;
    current = s;
    const E = LINES.evening;
    const lv = level(s.household);
    const kitchen = $(el, '[data-kitchen]');
    kitchen.dataset.level = lv;
    const tableKey = `${lv}-${ev.paying.food}`;
    if (tableKey !== drawnTable) {
      drawnTable = tableKey;
      $(el, '[data-table]').innerHTML = tableSvg(lv, ev.paying.food);
    }
    $(el, '[data-scene]').textContent = E.kitchen[lv];
    // Follows the food box as it is ticked: no food tonight, and Lotte gives her plate to Inge.
    $(el, '[data-lotte]').textContent = !ev.paying.food ? E.lotte.hungry : E.lotte[lv];
    const ill = s.flags.ingeIll && !s.flags.ingeRecovered;
    $(el, '[data-inge]').textContent = ill ? E.inge.ill : s.flags.ingeRecovered && lv !== 'high' ? E.inge.recovered : E.inge[lv];

    const spend = eveningSpend(s);
    $(el, '[data-wallet]').textContent = rm(s.money);
    $(el, '[data-left]').textContent = fill(U.after, { money: rm(s.money - spend) });
    for (const input of el.querySelectorAll<HTMLInputElement>('[data-bill]')) {
      const b = input.dataset.bill as Bill;
      input.checked = ev.paying[b];
      input.closest('label')!.classList.toggle('tight', !ev.paying[b] && spend + billCost(b) > s.money + 1e-9);
    }
    const breadRow = $(el, '[data-bread-row]');
    breadRow.hidden = !jakubPresent(s);
    breadInput.checked = ev.bread;
    breadRow.classList.toggle('tight', !ev.bread && spend + T.food > s.money + 1e-9);

    const talk = homeTalk(s);
    $(el, '[data-talk]').hidden = !talk;
    if (talk) {
      $(el, '[data-talk-line]').textContent = talk.line;
      const chosen = s.story.talks[String(s.week)];
      const reply = talk.options.find((o) => o.id === chosen)?.reply ?? '';
      $(el, '[data-talk-options]').replaceChildren(
        ...(chosen ? [] : homeTalkOptions(s)).map((o) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'reply-btn';
          b.dataset.option = o.id;
          b.textContent = o.label;
          return b;
        }),
      );
      const r = $(el, '[data-talk-reply]');
      r.hidden = !chosen;
      r.textContent = reply;
    }

    const news = E.newspaper[String(s.week) as keyof typeof E.newspaper];
    const c3 = CLUES.find((c) => c.id === 'C3')!;
    const canRead = clueAvailable(s, c3);
    // Show the photo once it has been read: this evening, or any week-2 evening after.
    const read = s.clues.includes('C3') && (s.week === 2 || !state.clues.includes('C3'));
    $(el, '[data-news]').textContent = read ? c3.text : news || (canRead ? E.folded : '');
    $(el, '[data-read]').hidden = !canRead;

    const notebook = $(el, '[data-notebook]');
    const notes = CLUES.filter((c) => s.clues.includes(c.id)).map((c) => c.note);
    notebook.replaceChildren(
      ...(notes.length ? notes : [E.notebookEmpty]).map((n) => {
        const li = document.createElement('li');
        li.textContent = n;
        return li;
      }),
    );
  }

  update(state);
  return { el, update, destroy() {} };
}
