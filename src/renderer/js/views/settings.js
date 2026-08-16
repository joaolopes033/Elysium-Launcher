import { elysium } from '../ipc.js';
import { setState } from '../state.js';
import { escapeHtml, toast } from '../components.js';

function formatSyncDate(isoString) {
  if (!isoString) return 'nunca sincronizado';
  try {
    return new Date(isoString).toLocaleString('pt-BR');
  } catch {
    return isoString;
  }
}

export async function render(container) {
  const settings = await elysium.settings.get();
  const version = await elysium.app.getVersion();

  container.innerHTML = `
    <div class="view-pad">
      <div class="view-header">
        <div>
          <h1 class="view-title">Configurações</h1>
        </div>
      </div>

      <div class="settings-section" id="catalog-source-section">
        <h3>Fonte do Catálogo</h3>
        <div class="hint">
          O catálogo não vem mais embutido no app. Informe a URL de um JSON de catálogo no formato descrito em <code>docs/CATALOG_SCHEMA.md</code>. O Elysium Launcher não sugere nem indica fontes — a escolha é sempre sua.
        </div>

        <div class="settings-row">
          <div style="flex:1;">
            <div class="settings-row-label">URL do catálogo</div>
            <input
              type="url"
              id="catalog-source-url"
              class="path-display"
              style="width:100%;box-sizing:border-box;background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:8px 10px;"
              placeholder="https://exemplo.org/catalogo.json"
              value="${settings.catalogSourceUrl ? escapeHtml(settings.catalogSourceUrl) : ''}"
            />
          </div>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row-label">Última sincronização</div>
            <div class="settings-row-desc" id="catalog-last-sync">${formatSyncDate(settings.catalogLastSyncAt)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="btn-test-catalog">Testar conexão</button>
            <button class="btn btn-primary btn-sm" id="btn-save-catalog">Salvar fonte</button>
            <button class="btn btn-ghost btn-sm" id="btn-remove-catalog" ${settings.catalogSourceUrl ? '' : 'disabled'}>Remover fonte</button>
          </div>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row-label">Buscar capas automaticamente</div>
            <div class="settings-row-desc">Quando um jogo do catálogo não traz <code>coverImageUrl</code>, busca a imagem de preview da própria página oficial do jogo (mesma técnica de preview usada por apps de mensagem). Nada é baixado/guardado — só a URL é resolvida e exibida direto da fonte.</div>
          </div>
          <div class="toggle ${settings.autoFetchCoverImages !== false ? 'on' : ''}" id="toggle-auto-cover" role="switch" aria-checked="${settings.autoFetchCoverImages !== false}" tabindex="0"></div>
        </div>

        <button class="btn btn-ghost btn-sm" id="btn-view-legal" style="margin-top:4px;">Ver LEGAL.md</button>
        <div id="legal-doc-panel" style="display:none;max-height:220px;overflow-y:auto;margin-top:8px;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;white-space:pre-wrap;font-size:12px;"></div>
      </div>

      <div class="settings-section">
        <h3>Downloads</h3>
        <div class="hint">Onde os jogos instalados ficam salvos no seu computador.</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Pasta de downloads</div>
            <div class="path-display" id="download-path" title="${escapeHtml(settings.downloadPath)}">${escapeHtml(settings.downloadPath)}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-change-folder">Alterar</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Sobre</h3>
        <p class="about-line">Elysium Launcher <span class="nums">v${escapeHtml(version)}</span></p>
        <p class="about-line">Catálogo carregado de uma fonte externa configurada acima, com download via torrent ou HTTP direto.</p>
        <p class="about-line">Nenhum dado é enviado a servidores — tudo roda localmente no seu computador.</p>
      </div>
    </div>
  `;

  container.querySelector('#btn-change-folder').addEventListener('click', async () => {
    try {
      const chosen = await elysium.settings.chooseDownloadFolder();
      if (!chosen) return;
      await elysium.settings.set({ downloadPath: chosen });
      const el = container.querySelector('#download-path');
      el.textContent = chosen;
      el.title = chosen;
      toast('Pasta de downloads atualizada.', 'success');
    } catch (err) {
      toast(`Não foi possível trocar a pasta: ${err.message}`, 'error');
    }
  });

  wireCatalogSourceSection(container);
}

function wireCatalogSourceSection(container) {
  const urlInput = container.querySelector('#catalog-source-url');
  const lastSyncEl = container.querySelector('#catalog-last-sync');
  const removeBtn = container.querySelector('#btn-remove-catalog');
  const legalPanel = container.querySelector('#legal-doc-panel');

  container.querySelector('#btn-test-catalog').addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      toast('Informe uma URL primeiro.', 'error');
      return;
    }
    try {
      const result = await elysium.catalog.testConnection(url);
      if (result.ok) {
        toast(`Conexão OK — ${result.validItems} de ${result.totalItems} itens válidos.`, 'success');
      } else {
        toast(`Falha: ${result.error}`, 'error');
      }
    } catch (err) {
      toast(`Falha ao testar: ${err.message}`, 'error');
    }
  });

  container.querySelector('#btn-save-catalog').addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      toast('Informe uma URL primeiro.', 'error');
      return;
    }
    try {
      await elysium.settings.set({ catalogSourceUrl: url });
      const result = await elysium.catalog.sync();

      if (result.offline) {
        const cacheNote = result.usedCache ? 'Usando o último catálogo válido em cache.' : 'Ainda sem cache disponível.';
        toast(`Fonte salva, mas a sincronização falhou (${result.error}). ${cacheNote}`, 'error');
      } else {
        const count = result.games.length;
        toast(`Fonte salva. ${count} ${count === 1 ? 'item carregado' : 'itens carregados'}.`, 'success');
      }

      setState({ catalog: result.games });
      removeBtn.removeAttribute('disabled');
      const fresh = await elysium.settings.get();
      lastSyncEl.textContent = formatSyncDate(fresh.catalogLastSyncAt);
    } catch (err) {
      toast(`Não foi possível salvar: ${err.message}`, 'error');
    }
  });

  removeBtn.addEventListener('click', async () => {
    await elysium.settings.set({ catalogSourceUrl: null, catalogCacheRaw: null, catalogLastSyncAt: null });
    setState({ catalog: [] });
    urlInput.value = '';
    removeBtn.setAttribute('disabled', 'true');
    lastSyncEl.textContent = formatSyncDate(null);
    toast('Fonte removida. O catálogo voltou ao estado vazio.');
  });

  container.querySelector('#btn-view-legal').addEventListener('click', async () => {
    const isHidden = legalPanel.style.display === 'none' || !legalPanel.style.display;
    if (!isHidden) {
      legalPanel.style.display = 'none';
      legalPanel.textContent = '';
      return;
    }
    try {
      const doc = await elysium.legalNotice.getDocument();
      legalPanel.textContent = doc.ok ? doc.content : `Não foi possível carregar LEGAL.md (${doc.error || ''}).`;
      legalPanel.style.display = 'block';
    } catch (err) {
      toast(`Não foi possível carregar LEGAL.md: ${err.message}`, 'error');
    }
  });

  const coverToggle = container.querySelector('#toggle-auto-cover');
  const flipCoverToggle = async () => {
    const next = !coverToggle.classList.contains('on');
    coverToggle.classList.toggle('on', next);
    coverToggle.setAttribute('aria-checked', String(next));
    try {
      await elysium.settings.set({ autoFetchCoverImages: next });
      toast(next ? 'Busca automática de capas ligada.' : 'Busca automática de capas desligada.');
    } catch (err) {
      toast(`Não foi possível salvar: ${err.message}`, 'error');
    }
  };
  coverToggle.addEventListener('click', flipCoverToggle);
  coverToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flipCoverToggle();
    }
  });
}
