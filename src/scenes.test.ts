// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { type Action, reduce } from './reducer';
import { endingView } from './scenes/ending';
import { eveningView } from './scenes/evening';
import { breakView } from './scenes/break';
import { officeView } from './scenes/office';
import { shiftView } from './scenes/shift';
import { shiftReportView } from './scenes/shiftReport';
import { titleView } from './scenes/title';
import type { View } from './scenes/view';
import { weekReportView } from './scenes/weekReport';
import { weekStartView } from './scenes/weekStart';
import { type GameState, initialState } from './state';
import { TUNING as T } from './tuning';

const noop = (_: Action) => {};
const STEP = 1 / 60;
const run = (s: GameState, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9 && s.scene === 'shift'; t += STEP) s = reduce(s, { type: 'tick', dt: STEP });
  return s;
};

/** Plays forward to each scene, with an unusual knowledge value that would be easy to spot. */
function scenes(): [string, View][] {
  const knowledge = 3.7;
  const fresh = reduce(initialState(5), { type: 'newGame', seed: 5 });
  const opening = weekStartView(fresh, noop);
  let s: GameState = { ...reduce(fresh, { type: 'advance' }), knowledge, week: 5, shift: 2, clues: ['C2', 'C5'] };
  const out: [string, View][] = [['title', titleView(noop, () => {})], ['weekStart', opening], ['shift', shiftView(s, noop)]];
  s = run({ ...s, today: { good: 50, amber: 0, scrap: 2 } }, T.shiftLength);
  out.push(['shiftReport', shiftReportView(s, noop)]);
  s = reduce(s, { type: 'advance' });
  out.push(['office', officeView(s, noop)]);
  s = reduce(reduce(s, { type: 'choose', sceneId: 'office', option: 'refuse' }), { type: 'advance' });
  out.push(['evening', eveningView(s, noop)]);
  s = reduce({ ...s, shift: 3, evening: { ...s.evening!, bills: [] } }, { type: 'advance' });
  out.push(['weekReport', weekReportView(s, noop)]);
  let b: GameState = { ...reduce(fresh, { type: 'advance' }), knowledge, week: 2 };
  b = reduce(run({ ...b, today: { good: 50, amber: 0, scrap: 0 } }, T.shiftLength), { type: 'advance' });
  out.push(['break', breakView(b, noop)]);
  s = { ...s, scene: 'ending', ending: 9 };
  out.push(['ending', endingView(s, noop)]);
  return out;
}

describe('rendered scenes', () => {
  it('reach every screen', () => {
    expect(scenes().map(([name]) => name)).toEqual([
      'title',
      'weekStart',
      'shift',
      'shiftReport',
      'office',
      'evening',
      'weekReport',
      'break',
      'ending',
    ]);
  });

  it('never show knowledge as a number', () => {
    for (const [name, v] of scenes()) {
      const text = v.el.textContent ?? '';
      expect(text, name).not.toMatch(/3[.,]7|knowledge|Wissensstand/i);
      v.destroy();
    }
  });

  it('style the Report reply like every other reply', () => {
    const v = scenes().find(([n]) => n === 'office')![1];
    const classes = new Set([...v.el.querySelectorAll('[data-option]')].map((b) => b.className));
    expect(classes.size).toBeLessThanOrEqual(1);
  });
});

describe('evening toggles', () => {
  const evening = (money: number) => {
    let s: GameState = { ...reduce(reduce(initialState(2), { type: 'newGame', seed: 2 }), { type: 'advance' }), week: 4 };
    s = reduce(run({ ...s, today: { good: 55, amber: 0, scrap: 0 } }, T.shiftLength), { type: 'advance' });
    s = reduce(reduce(s, { type: 'choose', sceneId: 'break', option: 'nod' }), { type: 'advance' });
    return { ...s, money };
  };

  it('wraps the bread when there is money for it', () => {
    const sent: Action[] = [];
    const v = eveningView(evening(20), (a) => sent.push(a));
    const bread = v.el.querySelector<HTMLInputElement>('[data-bread]')!;
    expect(bread.disabled).toBe(false);
    bread.checked = true;
    bread.dispatchEvent(new Event('change', { bubbles: true }));
    expect(sent).toEqual([{ type: 'choose', sceneId: 'evening', option: 'bread' }]);
  });

  it('says why when the money runs short, instead of greying the box out', () => {
    const sent: Action[] = [];
    const v = eveningView(evening(T.food + T.coal + 1), (a) => sent.push(a));
    const bread = v.el.querySelector<HTMLInputElement>('[data-bread]')!;
    expect(bread.disabled).toBe(false);
    bread.checked = true;
    bread.dispatchEvent(new Event('change', { bubbles: true }));
    expect(sent).toEqual([]);
    expect(bread.checked).toBe(false);
    expect(v.el.querySelector<HTMLElement>('[data-short]')!.hidden).toBe(false);
  });
});
