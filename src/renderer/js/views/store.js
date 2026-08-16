import { elysium } from '../ipc.js';
import { setState } from '../state.js';
import { gameCardHTML, emptyState, icon, escapeHtml } from '../components.js';
import { goToGame, navigate } from '../router.js';

let localQuery = '';
let localGenres = new Set();
let localSort = 'name';

export async function render(container, state) {
  const settings = await elysium.settings.get();

  if (!settings.catalogSourceUrl) {
    renderNoSourceState(container);
    return;
  }

  const catalog = state.catalog.length ? state.catalog : await loadCatalog();

  if (state.storeGenreFilter) {
    localGenres = new Set([state.storeGenreFilter]);
    setState({ storeGenreFilter: null });
  }

  const allGenres = [...new Set(catalog.flatMap((g) => g.genres || []))].sort();

  container.innerHTML = `
    <div class="view-pad">
      <div class="view-header">
        <div>
          <h1 class="view-title">Loja</h1>
          <div class="view-subtitle">Catálogo carregado da fonte que você configurou em Configurações.</div>
        </div>
      </div>

      <div class="store-toolbar">
        <div class="search-box">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M20 20 16 16"/></svg>
          <input type="text" id="store-search" placeholder="Buscar no catálogo..." value="${escapeHtml(localQuery)}" />
        </div>
        <div class="filter-pills" id="genre-pills">
          ${allGenres.map((g) => `<button class="filter-pill ${localGenres.has(g) ? 'active' : ''}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}
        </div>
        <select class="sort-select" id="store-sort">
          <option value="name" ${localSort === 'name' ? 'selected' : ''}>Nome (A-Z)</option>
          <option value="recent" ${localSort === 'recent' ? 'selected' : ''}>Adicionados recentemente</option>
        </select>
      </div>

      <div id="store-results"></div>
    </div>
  `;

  const searchInput = container.querySelector('#store-search');
  searchInput.addEventListener('input', () => {
    localQuery = searchInput.value;
    renderResults(container, catalog);
  });

  container.querySelectorAll('#genre-pills [data-genre]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const g = pill.dataset.genre;
      if (localGenres.has(g)) localGenres.delete(g);
      else localGenres.add(g);
      pill.classList.toggle('active');
      renderResults(container, catalog);
    });
  });

  container.querySelector('#store-sort').addEventListener('change', (e) => {
    localSort = e.target.value;
    renderResults(container, catalog);
  });

  renderResults(container, catalog);
}

function renderNoSourceState(container) {
  container.innerHTML = `<div class="view-pad"></div>`;
  const pad = container.querySelector('.view-pad');
  pad.innerHTML = emptyState({
    icon: icon('store'),
    title: 'Nenhuma fonte de catálogo configurada',
    desc: 'Configure uma fonte de catálogo em Configurações para navegar pelos jogos disponíveis.',
  });
  pad.querySelector('.empty-state').insertAdjacentHTML(
    'beforeend',
    `<button class="btn btn-primary" data-action="go-settings" style="margin-top:6px;">Ir para Configurações</button>`,
  );
  pad.querySelector('[data-action="go-settings"]').addEventListener('click', () => navigate('settings'));
}

function renderResults(container, catalog) {
  const q = localQuery.trim().toLowerCase();
  let results = catalog.filter((g) => {
    const matchesQuery = !q || g.name.toLowerCase().includes(q) || (g.genres || []).some((x) => x.toLowerCase().includes(q));
    const matchesGenre = localGenres.size === 0 || (g.genres || []).some((x) => localGenres.has(x));
    return matchesQuery && matchesGenre;
  });

  if (localSort === 'name') {
    results = results.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    results = results.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
  }

  const resultsEl = container.querySelector('#store-results');
  if (results.length === 0) {
    resultsEl.innerHTML = emptyState({
      icon: icon('store'),
      title: 'Nenhum jogo encontrado',
      desc: 'Tente outra busca ou remova alguns filtros de categoria.',
    });
    return;
  }

  resultsEl.innerHTML = `
    <div class="result-count">${results.length} jogo${results.length === 1 ? '' : 's'}</div>
    <div class="card-grid">${results.map((g) => gameCardHTML(g)).join('')}</div>
  `;

  resultsEl.querySelectorAll('.game-card').forEach((card) => {
    card.addEventListener('click', () => goToGame(card.dataset.gameId));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToGame(card.dataset.gameId);
      }
    });
  });
}

async function loadCatalog() {
  const catalog = await elysium.catalog.list();
  setState({ catalog, loading: false });
  return catalog;
}
