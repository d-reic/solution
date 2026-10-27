import type { Action } from '../reducer';
import type { GameState } from '../state';

export type Dispatch = (action: Action) => void;

/** One screen. Built once when its scene starts, then updated from state. */
export interface View {
  el: HTMLElement;
  update(state: GameState): void;
  destroy(): void;
}

export function html(markup: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function $<T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T {
  return root.querySelector(sel) as T;
}
