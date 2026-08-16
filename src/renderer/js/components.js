
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function coverArt(game, { variant = 'default', asHero = false } = {}) {
  const [c1, c2] = (game.coverPalette && game.coverPalette.length === 2)
    ? game.coverPalette
    : ['#223245', '#17222e'];
  const angle = (hashString(game.id) % 60) + 110;
  const cls = ['cover'];
  if (variant === 'wide') cls.push('cover-wide');
  if (asHero) cls.push('cover-hero');

  const imageUrl = isHttpsImageUrl(game.resolvedCoverImageUrl) ? game.resolvedCoverImageUrl : null;

  if (imageUrl) {
    return `<div class="${cls.join(' ')}" data-fallback-c1="${escapeHtml(c1)}" data-fallback-c2="${escapeHtml(c2)}" data-fallback-angle="${angle}" role="img" aria-label="Capa de ${escapeHtml(game.name)}">
      <img class="cover-img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />
    </div>`;
  }

  const style = `background: linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%);`;
  return `<div class="${cls.join(' ')}" style="${style}" role="img" aria-label="Capa de ${escapeHtml(game.name)}">
    <span class="cover-wordmark">${escapeHtml(game.name)}</span>
  </div>`;
}

function isHttpsImageUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function initCoverImageFallback() {
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('cover-img')) return;
    const wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('cover')) return;

    const c1 = wrapper.dataset.fallbackC1 || '#223245';
    const c2 = wrapper.dataset.fallbackC2 || '#17222e';
    const angle = wrapper.dataset.fallbackAngle || '140';
    wrapper.style.background = `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;

    const name = (wrapper.getAttribute('aria-label') || '').replace(/^Capa de /, '');
    img.remove();
    const span = document.createElement('span');
    span.className = 'cover-wordmark';
    span.textContent = name;
    wrapper.appendChild(span);
  }, true);
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

export function statusLabel(status) {
  const map = {
    metadados: 'Buscando peers e metadados',
    'sem-peers': 'Nenhum peer encontrado ainda',
    baixando: 'Baixando',
    pausado: 'Pausado',
    concluido: 'Concluido',
    baixado: 'Instalado',
    erro: 'Erro',
    manual: 'Download manual',
  };
  return map[status] || status;
}

let toastSeq = 0;
export function toast(message, type = 'info', timeout = 3800) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const id = `toast-${++toastSeq}`;
  const el = document.createElement('div');
  el.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  el.id = id;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

export function gameCardHTML(game, { wide = false, showQuickInstall = false } = {}) {
  const genre = game.genres && game.genres[0] ? game.genres[0] : '';
  return `
    <article class="game-card" data-game-id="${escapeHtml(game.id)}" tabindex="0" role="button" aria-label="Ver ${escapeHtml(game.name)}">
      <div style="position:relative;">
        ${coverArt(game, { variant: wide ? 'wide' : 'default' })}
        ${showQuickInstall ? `
          <div class="game-card-quickbar">
            <button class="btn btn-primary btn-sm" data-action="quick-install" data-game-id="${escapeHtml(game.id)}">Instalar</button>
          </div>` : ''}
      </div>
      <div class="game-card-title">${escapeHtml(game.name)}</div>
      <div class="game-card-meta">
        <span>${escapeHtml(genre)}</span>
        <span aria-hidden="true">·</span>
        <span class="pill pill-positive" style="padding:1px 7px;">Gratis</span>
      </div>
    </article>
  `;
}

export function emptyState({ icon = '', title, desc }) {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(desc)}</p>
    </div>
  `;
}

const ICONS = {
  store: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8 5.5 4h13L20 8"/><path d="M4 8h16v11H4z"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v11"/><path d="M7.5 11 12 15.5 16.5 11"/><path d="M4.5 18h15"/></svg>',
  library: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="4.5" height="16"/><rect x="10.2" y="4" width="4.5" height="16"/></svg>',
};
export function icon(name) {
  return ICONS[name] || '';
}

export function confirmModal({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">Cancelar</button>
          <button class="btn ${danger ? 'btn-danger-ghost' : 'btn-primary'}" data-act="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
      const act = e.target.closest('[data-act]');
      if (act) close(act.dataset.act === 'confirm');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
