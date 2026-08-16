import { elysium } from './ipc.js';
import { setState } from './state.js';
import { initRouter, navigate } from './router.js';
import { ensureLegalNoticeAccepted } from './first-run-notice.js';
import { initCoverImageFallback } from './components.js';

async function bootstrap() {
  await ensureLegalNoticeAccepted();

  initCoverImageFallback();
  wireTitlebar();

  initRouter();

  const [catalog, library] = await Promise.all([elysium.catalog.list(), elysium.library.list()]);
  setState({ catalog, library, loading: false });

  const countEl = document.getElementById('catalog-count');
  if (countEl) countEl.textContent = String(catalog.length);

  elysium.downloads.onProgress((list) => updateDownloadsBadge(list));
  elysium.library_events.onChanged((library) => setState({ library }));

  await navigate('home');

  const initialDownloads = await elysium.downloads.list();
  updateDownloadsBadge(initialDownloads);
}

function updateDownloadsBadge(list) {
  const badge = document.getElementById('downloads-badge');
  if (!badge) return;
  const emAndamento = ['baixando', 'pausado', 'metadados', 'sem-peers'];
  const active = (list || []).filter((d) => emAndamento.includes(d.status));
  if (active.length === 0) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = String(active.length);
}

function wireTitlebar() {
  const min = document.getElementById('btn-minimize');
  const max = document.getElementById('btn-maximize');
  const close = document.getElementById('btn-close');
  if (min) min.addEventListener('click', () => elysium.system.minimize());
  if (max) max.addEventListener('click', () => elysium.system.maximize());
  if (close) close.addEventListener('click', () => elysium.system.close());
}

bootstrap().catch((err) => {
  console.error('[renderer] falha ao iniciar:', err);
  const root = document.getElementById('view-root');
  if (root) {
    root.innerHTML = `<div class="view-pad"><p class="desc">Falha ao iniciar o Elysium Launcher: ${err.message}</p></div>`;
  }
});
