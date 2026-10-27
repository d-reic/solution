import './style.css';
import { whistle } from './audio';
import { createLoop } from './loop';
import { type Action, reduce } from './reducer';
import { shiftView } from './scenes/shift';
import { shiftReportView } from './scenes/shiftReport';
import { titleView } from './scenes/title';
import type { View } from './scenes/view';
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

function mount() {
  view?.destroy();
  mountedScene = state.scene;
  switch (state.scene) {
    case 'shift':
      view = shiftView(state, dispatch);
      break;
    case 'shiftReport':
      view = shiftReportView(state, dispatch);
      break;
    default:
      // Scenes from later milestones fall back to the title for now.
      view = titleView(dispatch);
  }
  root.replaceChildren(view.el);
  if (state.scene === 'shift') loop.start();
  else loop.stop();
  if (state.scene === 'shiftReport') whistle();
  window.scrollTo({ top: 0 });
}

mount();
