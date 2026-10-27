import type { GameState } from './state';

const KEY = 'solution.save';
const VERSION = 3; // bump when GameState changes shape

/** Autosave at each scene change. Storage can be blocked; the game still runs without it. */
export function saveGame(state: GameState) {
  try {
    // The title screen leaves the save alone, so it can offer Continue.
    if (state.scene === 'title') return;
    if (state.scene === 'ending' || state.scene === 'ledger') {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, JSON.stringify({ v: VERSION, state }));
    }
  } catch {
    // No storage: nothing to continue from next time.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { v: number; state: GameState };
    return data.v === VERSION && data.state?.scene ? data.state : null;
  } catch {
    return null;
  }
}
