import { elysium } from '../ipc.js';
import { setState } from '../state.js';
import {
  coverArt, escapeHtml, emptyState, icon, toast, confirmModal, statusLabel,
} from '../components.js';
import { goToGame, navigate } from '../router.js';

export async function render(container, state) {
  const settings = await elysium.settings.get();
  const library = await elysium.library.list();
  setState({ library });

  if (!settings.catalogSourceUrl && Object.keys(library).length === 0) {
    renderNoSourceState(container);
    return;
  }

  const catalog = state.catalog.length ? state.catalog : await elysium.catalog.list();
  if (!state.catalog.length) setState({ catalog });

  const installedGames = catalog
    .filter((g) => library[g.id])
    .map((g) => ({ game: g, entry: library[g.id] }));

  container.innerHTML = `
    <div class="view-pad">
      <div class="view-header">
        <div>
          <h1 class="view-title">Biblioteca</h1>
          <div class="view-subtitle">${installedGames.length} jogo${installedGames.length === 1 ? '' : 's'} na sua biblioteca local.</div>
        </div>
      </div>
      <div id="library-body"></div>
    </div>
  `;

  const body = container.querySelector('#library-body');

  if (installedGames.length === 0) {
    body.innerHTML = emptyState({
      icon: icon('library'),
      title: 'Sua biblioteca está vazia',
      desc: 'Instale jogos na Loja para vê-los aparecer aqui.',
    });
    body.querySelector('.empty-state').insertAdjacentHTML(
      'beforeend',
      `<button class="btn btn-primary" data-action="go-store" style="margin-top:6px;">Ir para a Loja</button>`,
    );
    body.querySelector('[data-action="go-store"]').addEventListener('click', () => navigate('store'));
    return;
  }

  body.innerHTML = `<div class="library-grid">${installedGames.map(cardHTML).join('')}</div>`;
  wireCards(body, installedGames);
}

function renderNoSourceState(container) {
  container.innerHTML = `
    <div class="view-pad">
      <div class="view-header">
        <div><h1 class="view-title">Biblioteca</h1></div>
      </div>
      <div id="library-body"></div>
    </div>
  `;
  const body = container.querySelector('#library-body');
  body.innerHTML = emptyState({
    icon: icon('library'),
    title: 'Nenhuma fonte de catálogo configurada',
    desc: 'Configure uma fonte de catálogo em Configurações para começar a instalar jogos.',
  });
  body.querySelector('.empty-state').insertAdjacentHTML(
    'beforeend',
    `<button class="btn btn-primary" data-action="go-settings" style="margin-top:6px;">Ir para Configurações</button>`,
  );
  body.querySelector('[data-action="go-settings"]').addEventListener('click', () => navigate('settings'));
}

function cardHTML({ game, entry }) {
  const ready = entry.status === 'baixado' && entry.executablePath;
  return `
    <div class="library-card" data-game-id="${escapeHtml(game.id)}">
      ${coverArt(game, { variant: 'wide' })}
      <div class="library-card-body">
        <div class="library-card-title">${escapeHtml(game.name)}</div>
        <div class="library-card-status">${escapeHtml(statusLabel(entry.status))}${entry.lastPlayedAt ? ' · jogado recentemente' : ''}</div>
        <div class="library-card-actions">
          ${ready
            ? `<button class="btn btn-positive btn-sm" data-action="play">Jogar</button>`
            : `<button class="btn btn-secondary btn-sm" data-action="details">Configurar</button>`}
          <button class="btn btn-ghost btn-sm btn-icon" data-action="folder" title="Ver arquivos">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>
          </button>
          <button class="btn btn-danger-ghost btn-sm btn-icon" data-action="remove" title="Desinstalar">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function wireCards(body, installedGames) {
  body.querySelectorAll('.library-card').forEach((card) => {
    const gameId = card.dataset.gameId;
    const found = installedGames.find((x) => x.game.id === gameId);
    if (!found) return;
    const { game } = found;

    const playBtn = card.querySelector('[data-action="play"]');
    if (playBtn) {
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const result = await elysium.game.play(gameId);
          if (!result.ok) toast('Não foi possível abrir o jogo.', 'error');
        } catch (err) {
          toast(`Não foi possível abrir o jogo: ${err.message}`, 'error');
        }
      });
    }

    const detailsBtn = card.querySelector('[data-action="details"]');
    if (detailsBtn) detailsBtn.addEventListener('click', (e) => { e.stopPropagation(); goToGame(gameId); });

    card.querySelector('[data-action="folder"]').addEventListener('click', (e) => {
      e.stopPropagation();
      elysium.game.openFolder(gameId).catch((err) => toast(`Não foi possível abrir a pasta: ${err.message}`, 'error'));
    });

    card.querySelector('[data-action="remove"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await confirmModal({
        title: `Desinstalar ${game.name}?`,
        message: 'Isso vai apagar os arquivos baixados deste jogo do seu computador.',
        confirmLabel: 'Desinstalar',
        danger: true,
      });
      if (!confirmed) return;
      try {
        const result = await elysium.game.uninstall(gameId);
        if (result && result.ok === false) {
          toast(result.error || 'Não foi possível desinstalar.', 'error');
          return;
        }
        toast('Jogo desinstalado.');
        navigate('library');
      } catch (err) {
        toast(`Não foi possível desinstalar: ${err.message}`, 'error');
      }
    });

    card.addEventListener('click', () => goToGame(gameId));
  });
}
