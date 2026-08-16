import { elysium } from '../ipc.js';
import { getState, setState } from '../state.js';
import {
  coverArt, escapeHtml, formatBytes, formatSpeed, formatEta, toast, confirmModal,
} from '../components.js';
import { navigate } from '../router.js';

export async function render(container, state) {
  const gameId = state.selectedGameId;
  const catalog = state.catalog.length ? state.catalog : await elysium.catalog.list();
  if (!state.catalog.length) setState({ catalog });

  const game = catalog.find((g) => g.id === gameId);
  if (!game) {
    container.innerHTML = `<div class="view-pad"><p class="desc">Jogo não encontrado no catálogo.</p></div>`;
    return;
  }

  const library = await elysium.library.list();
  setState({ library });

  container.innerHTML = layoutHTML(game, library[gameId]);
  wireBack(container);
  wireLinks(container, game);
  await wireCTA(container, game);

  const unsubscribe = elysium.downloads.onProgress((list) => {
    const mine = list.find((d) => d.gameId === game.id);
    updateInlineProgress(container, mine);
  });

  return () => unsubscribe();
}

function layoutHTML(game, libEntry) {
  return `
    <div class="view-pad">
      <button class="back-btn" data-action="back">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5 8 12l7 7"/></svg>
        Voltar
      </button>

      <div class="game-hero">
        ${coverArt(game, { variant: 'wide', asHero: true })}
        <div class="game-hero-content">
          <div class="game-hero-title">${escapeHtml(game.name)}</div>
          <div class="game-hero-tagline">${escapeHtml(game.tagline || '')}</div>
        </div>
      </div>

      <div class="game-layout">
        <div>
          <div class="meta-row">
            ${(game.genres || []).map((g) => `<span class="pill">${escapeHtml(g)}</span>`).join('')}
            <span class="pill pill-positive">Gratuito</span>
            <span class="pill">${escapeHtml(game.sizeApprox || '')}</span>
          </div>

          <div class="section-label">Sobre</div>
          <p class="desc">${escapeHtml(game.description || game.shortDescription || '')}</p>

          <div class="section-label">Requisitos</div>
          <p class="desc">
            <b>Sistema:</b> ${escapeHtml((game.systemRequirements && game.systemRequirements.os) || (game.os || []).join(', '))}<br/>
            <b>Armazenamento:</b> ${escapeHtml((game.systemRequirements && game.systemRequirements.storage) || game.sizeApprox || '—')}<br/>
            ${game.systemRequirements && game.systemRequirements.notes ? `<b>Observação:</b> ${escapeHtml(game.systemRequirements.notes)}` : ''}
          </p>
        </div>

        <aside class="info-panel">
          <div id="cta-area"></div>

          <hr class="info-divider" />

          <dl class="info-row"><dt>Desenvolvedor</dt><dd>${escapeHtml(game.developer || '—')}</dd></dl>
          <dl class="info-row"><dt>Licença</dt><dd>${escapeHtml(game.license || '—')}</dd></dl>
          <dl class="info-row"><dt>Versão</dt><dd>${escapeHtml(game.version || '—')}</dd></dl>
          <dl class="info-row"><dt>Tamanho</dt><dd>${escapeHtml(game.sizeApprox || '—')}</dd></dl>
          <dl class="info-row"><dt>Plataformas</dt><dd>${escapeHtml((game.os || []).join(', ') || '—')}</dd></dl>

          <hr class="info-divider" />

          <button class="btn btn-ghost btn-block" data-action="open-website">Página oficial</button>
          ${game.repository ? `<button class="btn btn-ghost btn-block" data-action="open-repo">Repositório / código-fonte</button>` : ''}

          ${game.download && game.download.torrent ? `
            <div class="torrent-note">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" style="flex:none;margin-top:1px;"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>
              <span>Distribuição via BitTorrent. ${escapeHtml(game.torrentNote || '')}</span>
            </div>
          ` : ''}
        </aside>
      </div>
    </div>
  `;
}

function wireBack(container) {
  container.querySelector('[data-action="back"]').addEventListener('click', () => navigate('store'));
}

function wireLinks(container, game) {
  const openBtn = container.querySelector('[data-action="open-website"]');
  if (openBtn) openBtn.addEventListener('click', () => elysium.system.openExternal(game.officialWebsite));
  const repoBtn = container.querySelector('[data-action="open-repo"]');
  if (repoBtn) repoBtn.addEventListener('click', () => elysium.system.openExternal(game.repository));
}

async function wireCTA(container, game) {
  const ctaArea = container.querySelector('#cta-area');
  const library = getState().library;
  const entry = library[game.id];

  ctaArea.innerHTML = ctaHTML(game, entry);
  bindCtaButtons(container, ctaArea, game);
}

function ctaHTML(game, entry) {
  if (!entry) {
    return `<button class="btn btn-primary btn-block" data-action="install">Instalar</button>`;
  }

  if (entry.status === 'baixando' || entry.status === 'pausado' || entry.status === 'metadados' || entry.status === 'sem-peers') {
    return `
      <div class="install-progress-inline" id="inline-progress">
        <div class="download-status">Preparando download...</div>
        <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
        <div class="download-stats nums"><span>0%</span></div>
      </div>
      <button class="btn btn-danger-ghost btn-block" data-action="cancel">Cancelar</button>
    `;
  }

  if (entry.status === 'erro') {
    return `
      <p class="desc" style="color:var(--danger);font-size:12px;">Ocorreu um erro no download. ${escapeHtml(entry.errorMessage || '')}</p>
      <button class="btn btn-primary btn-block" data-action="install">Tentar novamente</button>
    `;
  }

  if (entry.status === 'manual') {
    return `
      <p class="desc" style="font-size:12px;">Este jogo não tem download automático — abrimos a página oficial para você baixar manualmente.</p>
      <button class="btn btn-secondary btn-block" data-action="install">Abrir página oficial novamente</button>
      <button class="btn btn-ghost btn-block" data-action="set-exe">Já baixei — selecionar executável</button>
    `;
  }

  if (!entry.executablePath) {
    return `
      <p class="desc" style="font-size:12px;">Download concluído. Selecione o executável para poder abrir com um clique.</p>
      <button class="btn btn-primary btn-block" data-action="set-exe">Selecionar executável</button>
      <button class="btn btn-ghost btn-block" data-action="open-folder">Ver arquivos</button>
      <button class="btn btn-danger-ghost btn-block" data-action="uninstall">Desinstalar</button>
    `;
  }

  return `
    <button class="btn btn-positive btn-block" data-action="play">Jogar</button>
    <button class="btn btn-ghost btn-block" data-action="open-folder">Ver arquivos</button>
    <button class="btn btn-danger-ghost btn-block" data-action="uninstall">Desinstalar</button>
  `;
}

function bindCtaButtons(container, ctaArea, game) {
  const on = (action, handler) => {
    const el = ctaArea.querySelector(`[data-action="${action}"]`);
    if (el) el.addEventListener('click', handler);
  };

  on('install', async () => {
    const btn = ctaArea.querySelector('[data-action="install"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Iniciando...'; }
    try {
      await elysium.game.install(game.id);
      const library = await elysium.library.list();
      setState({ library });
      ctaArea.innerHTML = ctaHTML(game, library[game.id]);
      bindCtaButtons(container, ctaArea, game);
    } catch (err) {
      toast(`Não foi possível instalar: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Instalar'; }
    }
  });

  on('cancel', async () => {
    try {
      await elysium.downloads.cancel(game.id);
      const library = await elysium.library.list();
      setState({ library });
      ctaArea.innerHTML = ctaHTML(game, library[game.id]);
      bindCtaButtons(container, ctaArea, game);
      toast('Download cancelado.');
    } catch (err) {
      toast(`Não foi possível cancelar: ${err.message}`, 'error');
    }
  });

  on('play', async () => {
    try {
      const result = await elysium.game.play(game.id);
      if (!result.ok) {
        toast('Não foi possível abrir o jogo. Tente selecionar o executável novamente.', 'error');
      }
    } catch (err) {
      toast(`Não foi possível abrir o jogo: ${err.message}`, 'error');
    }
  });

  on('open-folder', () => elysium.game.openFolder(game.id).catch((err) => toast(`Não foi possível abrir a pasta: ${err.message}`, 'error')));

  on('set-exe', async () => {
    try {
      const result = await elysium.game.setExecutable(game.id);
      if (result.ok) {
        const library = await elysium.library.list();
        setState({ library });
        ctaArea.innerHTML = ctaHTML(game, library[game.id]);
        bindCtaButtons(container, ctaArea, game);
        toast('Executável definido.', 'success');
      }
    } catch (err) {
      toast(`Não foi possível selecionar o executável: ${err.message}`, 'error');
    }
  });

  on('uninstall', async () => {
    const confirmed = await confirmModal({
      title: `Desinstalar ${game.name}?`,
      message: 'Isso vai apagar os arquivos baixados deste jogo do seu computador.',
      confirmLabel: 'Desinstalar',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const result = await elysium.game.uninstall(game.id);
      if (result && result.ok === false) {
        toast(result.error || 'Não foi possível desinstalar.', 'error');
        return;
      }
      const library = await elysium.library.list();
      setState({ library });
      ctaArea.innerHTML = ctaHTML(game, library[game.id]);
      bindCtaButtons(container, ctaArea, game);
      toast('Jogo desinstalado.');
    } catch (err) {
      toast(`Não foi possível desinstalar: ${err.message}`, 'error');
    }
  });
}

function updateInlineProgress(container, info) {
  const block = container.querySelector('#inline-progress');
  if (!block || !info) return;
  const pct = Math.round((info.progress || 0) * 100);
  const fill = block.querySelector('.progress-fill');
  const stats = block.querySelector('.download-stats');
  const statusLine = block.querySelector('.download-status');

  if (fill) fill.style.width = `${pct}%`;

  if (stats) {
    if (info.type === 'http' && info.indeterminate) {
      stats.innerHTML = `<span>${formatBytes(info.downloaded)} baixados</span> · <span>${formatSpeed(info.downloadSpeed)}</span>`;
    } else {
      const remaining = info.length && info.downloadSpeed
        ? formatEta((info.length - info.downloaded) / info.downloadSpeed) : '--';
      stats.innerHTML = `<span>${pct}% · ${formatBytes(info.downloaded)} / ${formatBytes(info.length)}</span> · <span>${formatSpeed(info.downloadSpeed)}</span> · <span>${remaining}</span>`;
    }
  }

  if (statusLine) {
    if (info.status === 'metadados') {
      statusLine.textContent = `Buscando peers e metadados... (${info.numPeers || 0} conectados)`;
    } else if (info.status === 'sem-peers') {
      statusLine.textContent = 'Nenhum peer encontrado até agora. Pode ser que ninguém esteja compartilhando esse torrent agora, ou que o seu firewall/roteador esteja bloqueando tráfego de torrent (comum em rede corporativa/escolar). Pode continuar tentando ou cancelar.';
    } else if (info.status === 'pausado') {
      statusLine.textContent = 'Pausado.';
    } else if (info.type === 'torrent') {
      statusLine.textContent = `Baixando via torrent · ${info.numPeers || 0} peers`;
    } else {
      statusLine.textContent = 'Baixando...';
    }
  }
}
