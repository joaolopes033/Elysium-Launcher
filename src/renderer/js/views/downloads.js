import { elysium } from '../ipc.js';
import { setState } from '../state.js';
import {
  coverArt, escapeHtml, formatBytes, formatSpeed, formatEta, emptyState, icon, toast, statusLabel,
} from '../components.js';
import { navigate } from '../router.js';

export async function render(container, state) {
  const catalog = state.catalog.length ? state.catalog : await elysium.catalog.list();
  if (!state.catalog.length) setState({ catalog });

  container.innerHTML = `
    <div class="view-pad">
      <div class="view-header">
        <div>
          <h1 class="view-title">Downloads</h1>
          <div class="view-subtitle">Torrents e downloads diretos em andamento.</div>
        </div>
      </div>
      <div id="downloads-body"></div>
    </div>
  `;

  const body = container.querySelector('#downloads-body');

  async function refresh() {
    const list = await elysium.downloads.list();
    paint(body, catalog, list);
  }

  await refresh();

  const unsubscribe = elysium.downloads.onProgress((list) => paint(body, catalog, list));

  return () => unsubscribe();
}

function paint(body, catalog, downloads) {
  if (!downloads || downloads.length === 0) {
    body.innerHTML = emptyState({
      icon: icon('download'),
      title: 'Nenhum download em andamento',
      desc: 'Instale um jogo na Loja para ver o progresso aqui.',
    });
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.marginTop = '6px';
    btn.textContent = 'Ir para a Loja';
    btn.addEventListener('click', () => navigate('store'));
    body.querySelector('.empty-state').appendChild(btn);
    return;
  }

  body.innerHTML = downloads.map((d) => itemHTML(d, catalog)).join('');

  downloads.forEach((d) => {
    const el = body.querySelector(`[data-download-id="${cssEscape(d.gameId)}"]`);
    if (!el) return;

    const pauseBtn = el.querySelector('[data-action="pause"]');
    if (pauseBtn) pauseBtn.addEventListener('click', async () => {
      try { await elysium.downloads.pause(d.gameId); } catch (err) { toast(`Não foi possível pausar: ${err.message}`, 'error'); }
    });

    const resumeBtn = el.querySelector('[data-action="resume"]');
    if (resumeBtn) resumeBtn.addEventListener('click', async () => {
      try { await elysium.downloads.resume(d.gameId); } catch (err) { toast(`Não foi possível retomar: ${err.message}`, 'error'); }
    });

    const cancelBtn = el.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', async () => {
      try {
        await elysium.downloads.cancel(d.gameId);
        toast('Download cancelado.');
      } catch (err) {
        toast(`Não foi possível cancelar: ${err.message}`, 'error');
      }
    });
  });
}

function cssEscape(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function itemHTML(d, catalog) {
  const game = catalog.find((g) => g.id === d.gameId) || { name: d.gameId, coverPalette: null };
  const pct = Math.round((d.progress || 0) * 100);
  const remaining = d.length && d.downloadSpeed ? (d.length - d.downloaded) / d.downloadSpeed : Infinity;
  const isTorrent = d.type === 'torrent';
  const isDone = d.status === 'concluido';
  const isPaused = d.status === 'pausado';
  const isSearching = d.status === 'metadados' || d.status === 'sem-peers';

  const statsHTML = (d.type === 'http' && d.indeterminate)
    ? `<span>${formatBytes(d.downloaded)} baixados</span><span>${formatSpeed(d.downloadSpeed)}</span><span>tamanho desconhecido</span>`
    : `<span><b>${pct}%</b></span><span>${formatBytes(d.downloaded)} / ${formatBytes(d.length)}</span><span>${formatSpeed(d.downloadSpeed)}</span>` +
      (isTorrent ? `<span>↑ ${formatSpeed(d.uploadSpeed)}</span><span>${d.numPeers || 0} peers</span>` : '') +
      `<span>ETA ${isDone ? '--' : formatEta(remaining)}</span>`;

  return `
    <div class="download-item" data-download-id="${escapeHtml(d.gameId)}">
      <div class="download-thumb">${coverArt(game, { variant: 'wide' })}</div>
      <div class="download-main">
        <div class="download-title-row">
          <span class="download-title">${escapeHtml(game.name)}</span>
          <span class="type-badge ${isTorrent ? 'type-badge-torrent' : 'type-badge-http'}">${isTorrent ? 'Torrent' : 'HTTP'}</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${isDone ? 'done' : ''}" style="width:${isSearching ? 4 : pct}%"></div></div>
        <div class="download-stats nums">${statsHTML}</div>
        <div class="download-status">${escapeHtml(statusLabel(d.status))}${isTorrent ? ` · ${d.numPeers || 0} peers` : ''}</div>
      </div>
      <div class="download-actions">
        ${isTorrent && !isDone ? (
          isPaused
            ? `<button class="btn btn-secondary btn-sm" data-action="resume">Retomar</button>`
            : `<button class="btn btn-secondary btn-sm" data-action="pause">Pausar</button>`
        ) : ''}
        ${!isDone ? `<button class="btn btn-danger-ghost btn-sm" data-action="cancel">Cancelar</button>` : ''}
      </div>
    </div>
  `;
}
