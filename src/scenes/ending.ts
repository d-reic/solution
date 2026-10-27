import { fanfare } from '../audio';
import { LINES, UI, fill, num } from '../content';
import { epilogue, isVictory, ledgerRows, rankFor } from '../endings';
import type { GameState } from '../state';
import { TUNING as T } from '../tuning';
import { $, type Dispatch, html, type View } from './view';

export function endingView(state: GameState, dispatch: Dispatch): View {
  const id = state.ending!;
  const E = LINES.endings[String(id) as keyof typeof LINES.endings];
  const V = LINES.victory;
  const victory = isVictory(id);
  const parts = state.ledger.good + state.ledger.amber;
  const rank = rankFor(parts, state.quotaWorked);

  const el = html(`
    <section class="ending ${victory ? 'is-victory' : ''}">
      ${
        victory
          ? `<div class="reich">
              <p class="frak">${V.headline}</p>
              <p class="frak2">${V.line}</p>
              ${id === 4 ? `<div class="medal" aria-label="${V.medal}"><i></i><span>${V.medal}</span></div>` : ''}
              <p class="honor">${V.honor}</p>
              <p class="big">${num(state.score)}</p>
              <p class="honor">${fill(UI.ending.rank, { rank, of: T.operatorsOnWerk7 })}</p>
            </div>`
          : `<div class="plain">
              <p class="meta">Werk 7 · Bank 14</p>
              <h2></h2>
              <p class="big">${num(state.score)}</p>
              <p class="muted">${UI.ending.points}</p>
            </div>`
      }
      <div class="reveal" data-reveal>
        <div data-lines></div>
        <p class="verdict" data-verdict></p>
        <h3 class="ledger-title">${LINES.ledger.title}</h3>
        <table class="ledger"><tbody data-ledger></tbody></table>
        <div class="epilogue" data-epilogue></div>
        <button class="btn ghost" type="button" data-again>${UI.ending.again}</button>
      </div>
    </section>`);

  if (!victory) $(el, 'h2').textContent = E.name;
  const lines = $(el, '[data-lines]');
  for (const l of E.lines) {
    const p = document.createElement('p');
    p.textContent = l;
    lines.append(p);
  }
  $(el, '[data-verdict]').textContent = E.verdict;
  $(el, '[data-ledger]').replaceChildren(
    ...ledgerRows(state).map(([label, value]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = label;
      const td = document.createElement('td');
      td.textContent = num(value);
      tr.append(th, td);
      return tr;
    }),
  );
  $(el, '[data-epilogue]').replaceChildren(
    ...epilogue(state).map((l) => {
      const p = document.createElement('p');
      p.textContent = l;
      return p;
    }),
  );
  $(el, '[data-again]').onclick = () => dispatch({ type: 'newGame', seed: (Math.random() * 2 ** 32) >>> 0 });

  // Victory: the fanfare plays, and the ledger slides in underneath after 3 seconds.
  const reveal = $(el, '[data-reveal]');
  let timer = 0;
  if (victory) {
    reveal.classList.add('later');
    fanfare();
    timer = window.setTimeout(() => reveal.classList.add('in'), 3000);
  }

  return { el, update() {}, destroy: () => clearTimeout(timer) };
}
