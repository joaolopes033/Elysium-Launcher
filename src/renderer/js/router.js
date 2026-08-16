import { getState, setState } from './state.js';
import { render as renderHome } from './views/home.js';
import { render as renderStore } from './views/store.js';
import { render as renderGameDetail } from './views/gameDetail.js';
import { render as renderLibrary } from './views/library.js';
import { render as renderDownloads } from './views/downloads.js';
import { render as renderSettings } from './views/settings.js';

const routes = {
  home: renderHome,
  store: renderStore,
  game: renderGameDetail,
  library: renderLibrary,
  downloads: renderDownloads,
  settings: renderSettings,
};

let root = null;
let currentCleanup = null;

export function initRouter() {
  root = document.getElementById('view-root');

  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
}

export async function navigate(view, params = {}) {
  if (!routes[view]) view = 'home';

  setState({ view, ...params });

  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    const isActive = btn.dataset.view === view;
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  await renderCurrent();
  if (root) {
    root.scrollTop = 0;
    root.focus({ preventScroll: true });
  }
}

export async function renderCurrent() {
  if (!root) return;

  if (currentCleanup) {
    try { currentCleanup(); } catch { }
    currentCleanup = null;
  }

  const state = getState();
  const renderer = routes[state.view] || renderHome;
  const wrapper = document.createElement('div');
  wrapper.className = 'view';
  root.innerHTML = '';
  root.appendChild(wrapper);

  try {
    const cleanup = await renderer(wrapper, state);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error(`[router] falha ao renderizar a view "${state.view}":`, err);
    wrapper.innerHTML = `
      <div class="view-pad">
        <div class="empty-state">
          <h3>Não foi possível carregar esta tela</h3>
          <p>${err && err.message ? err.message.replace(/[<>]/g, '') : 'Erro desconhecido.'}</p>
        </div>
      </div>
    `;
  }
}

export function goToGame(gameId) {
  navigate('game', { selectedGameId: gameId });
}
