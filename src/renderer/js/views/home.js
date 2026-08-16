import { elysium } from '../ipc.js';
import { getState, setState } from '../state.js';
import { gameCardHTML, coverArt, escapeHtml, emptyState, icon } from '../components.js';
import { goToGame, navigate } from '../router.js';

export async function render(container) {
  const settings = await elysium.settings.get();

  if (!settings.catalogSourceUrl) {
    renderNoSourceState(container);
    return;
  }

  const state = getState();
  const catalog = state.catalog.length ? state.catalog : await loadCatalog();
  const library = state.library || {};

  const featured = catalog.filter((g) => g.featured);
  const heroGames = (featured.length ? featured : catalog).slice(0, 3);
  const recent = [...catalog].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '')).slice(0, 8);
  const installedIds = Object.keys(library);
  const continuePlaying = catalog.filter((g) => installedIds.includes(g.id));
  const genres = [...new Set(catalog.flatMap((g) => g.genres || []))].slice(0, 8);

  container.innerHTML = `
    <div class="view-pad">
      ${heroGames.length ? heroSectionHTML(heroGames) : ''}

      ${continuePlaying.length ? `
        <div class="row-header">
          <div class="row-title">Continuar jogando</div>
        </div>
        <div class="hrow">${continuePlaying.map((g) => gameCardHTML(g)).join('')}</div>
      ` : ''}

      ${catalog.length ? `
        <div class="row-header">
          <div class="row-title">Em destaque no catálogo</div>
        </div>
        <div class="hrow">${(featured.length ? featured : catalog).map((g) => gameCardHTML(g)).join('')}</div>

        <div class="row-header">
          <div class="row-title">Adicionados recentemente</div>
        </div>
        <div class="hrow">${recent.map((g) => gameCardHTML(g)).join('')}</div>
      ` : ''}

      ${genres.length ? `
        <div class="row-header"><div class="row-title">Categorias</div></div>
        <div class="filter-pills">
          ${genres.map((g) => `<button class="filter-pill" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  wireCardClicks(container);
  wireGenreChips(container);
  return wireHero(container, heroGames);
}

function renderNoSourceState(container) {
  container.innerHTML = `<div class="view-pad"></div>`;
  const pad = container.querySelector('.view-pad');
  pad.innerHTML = emptyState({
    icon: icon('store'),
    title: 'Nenhuma fonte de catálogo configurada',
    desc: 'Aponte o Elysium Launcher para a URL de um catálogo em JSON para ver seus jogos aqui.',
  });
  pad.querySelector('.empty-state').insertAdjacentHTML(
    'beforeend',
    `<button class="btn btn-primary" data-action="go-settings" style="margin-top:6px;">Ir para Configurações</button>`,
  );
  pad.querySelector('[data-action="go-settings"]').addEventListener('click', () => navigate('settings'));
}

async function loadCatalog() {
  const catalog = await elysium.catalog.list();
  setState({ catalog, loading: false });
  return catalog;
}

function heroSectionHTML(games) {
  return `
    <div class="hero">
      ${games.map((g, i) => `
        <div class="hero-slide ${i === 0 ? 'active' : ''}" data-hero-index="${i}">
          ${coverArt(g, { variant: 'wide', asHero: true })}
          <div class="hero-content" style="position:absolute;left:0;bottom:0;">
            <div class="hero-eyebrow">${escapeHtml((g.genres && g.genres[0]) || 'Destaque')}</div>
            <div class="hero-title">${escapeHtml(g.name)}</div>
            <div class="hero-desc">${escapeHtml(g.tagline || g.shortDescription || '')}</div>
            <div class="hero-actions">
              <button class="btn btn-primary" data-hero-open="${escapeHtml(g.id)}">Ver na loja</button>
            </div>
          </div>
        </div>
      `).join('')}
      ${games.length > 1 ? `
        <div class="hero-dots">
          ${games.map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-hero-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function wireHero(container, games) {
  container.querySelectorAll('[data-hero-open]').forEach((btn) => {
    btn.addEventListener('click', () => goToGame(btn.dataset.heroOpen));
  });

  if (games.length <= 1) return undefined;

  let index = 0;
  let heroTimer = null;
  const slides = container.querySelectorAll('.hero-slide');
  const dots = container.querySelectorAll('.hero-dot');
  const heroEl = container.querySelector('.hero');

  function show(i) {
    index = (i + games.length) % games.length;
    slides.forEach((s, si) => s.classList.toggle('active', si === index));
    dots.forEach((d, di) => d.classList.toggle('active', di === index));
  }

  function start() { heroTimer = setInterval(() => show(index + 1), 6500); }
  function stop() { clearInterval(heroTimer); }

  start();
  heroEl.addEventListener('mouseenter', stop);
  heroEl.addEventListener('mouseleave', start);

  dots.forEach((d) => d.addEventListener('click', () => show(Number(d.dataset.heroDot))));

  return () => stop();
}

function wireCardClicks(container) {
  container.querySelectorAll('.game-card').forEach((card) => {
    card.addEventListener('click', () => goToGame(card.dataset.gameId));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToGame(card.dataset.gameId);
      }
    });
  });
}

function wireGenreChips(container) {
  container.querySelectorAll('[data-genre]').forEach((chip) => {
    chip.addEventListener('click', () => navigate('store', { storeGenreFilter: chip.dataset.genre }));
  });
}
