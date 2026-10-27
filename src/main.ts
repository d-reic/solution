// Fonts ship with the game (no requests to Google). Latin subsets cover umlauts, ß and „“.
import '@fontsource/big-shoulders-stencil-display/latin-600';
import '@fontsource/big-shoulders-stencil-display/latin-800';
import '@fontsource/courier-prime/latin-400';
import '@fontsource/ibm-plex-mono/latin-400';
import '@fontsource/ibm-plex-mono/latin-400-italic';
import '@fontsource/ibm-plex-mono/latin-500';
import '@fontsource/ibm-plex-mono/latin-600';
import '@fontsource/unifrakturmaguntia/latin-400';
import './style.css';
import { whistle } from './audio';
import { createLoop } from './loop';
import { type Action, reduce } from './reducer';
import { saveGame, loadGame } from './save';
import { endingView } from './scenes/ending';
import { eveningView } from './scenes/evening';
import { officeView } from './scenes/office';
import { shiftView } from './scenes/shift';
import { shiftReportView } from './scenes/shiftReport';
import { titleView } from './scenes/title';
import type { View } from './scenes/view';
import { weekReportView } from './scenes/weekReport';
import { weekStartView } from './scenes/weekStart';
import { breakView } from './scenes/break';
import { type GameState, initialState } from './state';

const root = document.getElementById('app')!;
let state: GameState = initialState(0);
let view: View | null = null;
let mountedScene: GameState['scene'] | null = null;

const loop = createLoop(
  (dt) => {
    state = reduce(state, { type: 'tick', dt });
    if (state.scene !== mountedScene) mount();
  },
  () => view?.update(state),
);

function dispatch(action: Action) {
  state = reduce(state, action);
  if (state.scene !== mountedScene) mount();
  else view?.update(state);
}

function viewFor(s: GameState): View {
  switch (s.scene) {
    case 'weekStart':
      return weekStartView(s, dispatch);
    case 'break':
      return breakView(s, dispatch);
    case 'shift':
      return shiftView(s, dispatch);
    case 'shiftReport':
      return shiftReportView(s, dispatch);
    case 'evening':
      return eveningView(s, dispatch);
    case 'office':
      return officeView(s, dispatch);
    case 'weekReport':
      return weekReportView(s, dispatch);
    case 'ending':
    case 'ledger':
      return endingView(s, dispatch);
    default: {
      const saved = loadGame();
      return titleView(
        dispatch,
        saved
          ? () => {
              state = saved;
              mount();
            }
          : null,
      );
    }
  }
}

function mount() {
  view?.destroy();
  const from = mountedScene;
  mountedScene = state.scene;
  saveGame(state);
  view = viewFor(state);
  root.replaceChildren(view.el);
  view.update(state);
  if (state.scene === 'shift') loop.start();
  else loop.stop();
  if (from === 'shift' && state.scene === 'shiftReport') whistle();
  window.scrollTo({ top: 0 });
}

mount();

// Dev only: jump to any state from the console for playtesting (`__game.set({...})`).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: {
      get state() {
        return state;
      },
      set(patch: Partial<GameState>) {
        state = { ...state, ...patch };
        mount();
      },
      dispatch,
    },
  });
}
