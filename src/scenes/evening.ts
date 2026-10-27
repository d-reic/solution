import { CLUES, LINES, WEEKS } from '../content';
import { billCost, clueAvailable, eveningSpend, jakubPresent } from '../reducer';
import type { Bill, GameState } from '../state';
import { TUNING as T } from '../tuning';
import { rm } from './shiftReport';
import { $, type Dispatch, html, type View } from './view';

const level = (household: number) => (household >= 70 ? 'high' : household >= 35 ? 'mid' : 'low');

export function eveningView(state: GameState, dispatch: Dispatch): View {
  const month = WEEKS[state.week - 1]?.month ?? '';
  const el = html(`
    <section class="evening">
      <p class="meta">${month} 1941 · Week ${state.week} · Evening ${state.shift}</p>
      <h2>HOME</h2>
      <div class="home">
        <div class="kitchen" data-kitchen>
          <div class="table" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <p data-scene></p>
          <p class="said" data-lotte></p>
          <p class="said" data-inge></p>
        </div>
        <div class="household">
          <div class="wallet"><span class="lbl">Wallet</span><span class="val" data-wallet></span><span class="muted" data-left></span></div>
          <div class="bills" data-bills></div>
          <label class="toggle" data-bread-row hidden><input type="checkbox" data-bread /> <span>${LINES.evening.bread}</span><span class="price">${rm(T.food)}</span></label>
        </div>
      </div>
      <div class="papers">
        <div class="paper">
          <span class="lbl">Newspaper</span>
          <p data-news></p>
          <button class="link" type="button" data-read hidden>Read the newspaper</button>
        </div>
        <div class="notebook">
          <span class="lbl">Notebook</span>
          <ul data-notebook></ul>
        </div>
      </div>
      <button class="btn" type="button" data-next>${state.shift >= T.shiftsPerWeek ? 'END THE WEEK' : 'GO TO BED'}</button>
    </section>`);

  const bills = $(el, '[data-bills]');
  const e = state.evening!;
  for (const b of e.bills) {
    const row = html(`<label class="toggle"><input type="checkbox" data-bill="${b}" /> <span></span><span class="price">${rm(billCost(b))}</span></label>`);
    row.querySelector('span')!.textContent = LINES.evening.bills[b];
    bills.append(row);
  }
  bills.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    dispatch({ type: 'pay', bill: input.dataset.bill as Bill });
  });
  $(el, '[data-bread]').addEventListener('change', () => dispatch({ type: 'choose', sceneId: 'evening', option: 'bread' }));
  $(el, '[data-read]').onclick = () => dispatch({ type: 'choose', sceneId: 'evening', option: 'newspaper' });
  $(el, '[data-next]').onclick = () => dispatch({ type: 'advance' });

  function update(s: GameState) {
    const ev = s.evening;
    if (s.scene !== 'evening' || !ev) return;
    const E = LINES.evening;
    const lv = level(s.household);
    const kitchen = $(el, '[data-kitchen]');
    kitchen.dataset.level = lv;
    $(el, '[data-scene]').textContent = E.kitchen[lv];
    $(el, '[data-lotte]').textContent = s.flags.hungry ? E.lotte.hungry : E.lotte[lv];
    const ill = s.flags.ingeIll && !s.flags.ingeRecovered;
    $(el, '[data-inge]').textContent = ill ? E.inge.ill : s.flags.ingeRecovered && lv !== 'high' ? E.inge.recovered : E.inge[lv];

    const spend = eveningSpend(s);
    $(el, '[data-wallet]').textContent = rm(s.money);
    $(el, '[data-left]').textContent = `after tonight: ${rm(s.money - spend)}`;
    for (const input of el.querySelectorAll<HTMLInputElement>('[data-bill]')) {
      const b = input.dataset.bill as Bill;
      input.checked = ev.paying[b];
      input.disabled = !ev.paying[b] && spend + billCost(b) > s.money + 1e-9;
    }
    const breadRow = $(el, '[data-bread-row]');
    breadRow.hidden = !jakubPresent(s);
    const bread = $<HTMLInputElement>(el, '[data-bread]');
    bread.checked = ev.bread;
    bread.disabled = !ev.bread && spend + T.food > s.money + 1e-9;

    const news = E.newspaper[String(s.week) as keyof typeof E.newspaper];
    const c3 = CLUES.find((c) => c.id === 'C3')!;
    const canRead = clueAvailable(s, c3);
    // Show the photo once it has been read: this evening, or any week-2 evening after.
    const read = s.clues.includes('C3') && (s.week === 2 || !state.clues.includes('C3'));
    $(el, '[data-news]').textContent = read ? c3.text : news || (canRead ? 'The evening paper is on the table, still folded.' : '');
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
