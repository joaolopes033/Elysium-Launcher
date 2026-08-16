import { elysium } from './ipc.js';
import { escapeHtml } from './components.js';

const NOTICE_POINTS = [
  'O Elysium Launcher não vem com nenhum jogo, catálogo ou fonte pré-configurada.',
  'Você mesmo escolhe a URL do catálogo em Configurações → Fonte do Catálogo.',
  'O app não controla, verifica nem endossa o conteúdo de fontes de terceiros.',
  'Você é responsável por garantir que tem direito de acessar e usar o que configurar e baixar.',
  'Usar o app implica aceite dos Termos completos (LEGAL.md).',
];

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'legal-notice-overlay';
  overlay.innerHTML = `
    <div class="legal-notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="legal-notice-title">
      <h1 id="legal-notice-title">Antes de continuar</h1>
      <ul class="legal-notice-list">
        ${NOTICE_POINTS.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}
      </ul>

      <button type="button" class="legal-notice-doc-toggle" data-action="view-legal">
        Ler os Termos completos (LEGAL.md)
      </button>
      <div class="legal-notice-doc-panel" data-role="doc-panel" hidden></div>

      <div class="legal-notice-actions">
        <button type="button" class="btn btn-secondary" data-action="decline">Não concordo</button>
        <button type="button" class="btn btn-primary" data-action="accept">Li e concordo</button>
      </div>
    </div>
  `;
  return overlay;
}

export async function ensureLegalNoticeAccepted() {
  const status = await elysium.legalNotice.getStatus();
  if (!status.needsAcceptance) {
    return true;
  }

  return new Promise((resolve) => {
    const overlay = buildOverlay();
    document.body.appendChild(overlay);
    document.body.classList.add('legal-notice-open');

    const docPanel = overlay.querySelector('[data-role="doc-panel"]');

    overlay.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;

      if (action === 'accept') {
        await elysium.legalNotice.accept();
        overlay.remove();
        document.body.classList.remove('legal-notice-open');
        resolve(true);
        return;
      }

      if (action === 'decline') {
        overlay.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
        await elysium.legalNotice.decline();
        return;
      }

      if (action === 'view-legal') {
        const isHidden = docPanel.hasAttribute('hidden');
        if (!isHidden) {
          docPanel.setAttribute('hidden', 'true');
          docPanel.textContent = '';
          return;
        }
        const doc = await elysium.legalNotice.getDocument();
        docPanel.textContent = doc.ok ? doc.content : `Não foi possível carregar LEGAL.md (${doc.error || ''}).`;
        docPanel.removeAttribute('hidden');
      }
    });
  });
}
