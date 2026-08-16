
let state = {
  view: 'home',
  selectedGameId: null,
  catalog: [],
  library: {},
  downloads: [],
  settings: null,
  loading: true,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const fn of listeners) fn(state);
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
