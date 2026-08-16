'use strict';

const { getSettings, saveSettings } = require('./store');

const DEFAULT_TIMEOUT_MS = 15000;
const REQUIRED_STRING_FIELDS = ['id', 'name', 'license', 'officialWebsite', 'repository'];

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const COVER_FETCH_TIMEOUT_MS = 8000;
const COVER_FETCH_MAX_BYTES = 300 * 1024;
const COVER_FETCH_CONCURRENCY = 5;

const META_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
];

function isHttpsUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function extractMetaImageUrl(html, baseUrl) {
  for (const pattern of META_IMAGE_PATTERNS) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        const resolved = new URL(match[1], baseUrl).toString();
        if (isHttpsUrl(resolved)) return resolved;
      } catch {
      }
    }
  }
  return null;
}

async function fetchHtmlHead(url, timeoutMs = COVER_FETCH_TIMEOUT_MS, maxBytes = COVER_FETCH_MAX_BYTES) {
  if (!isHttpsUrl(url)) return '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html' }
    });
    if (!response.ok || !response.body) return '';

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    try {
      await reader.cancel();
    } catch {
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)), received).toString('utf-8');
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function resolveCoverImages(games) {
  const settings = getSettings();
  const autoFetch = settings.autoFetchCoverImages !== false;
  const cache = { ...(settings.coverImageCache || {}) };
  let cacheChanged = false;

  await mapWithConcurrency(games, COVER_FETCH_CONCURRENCY, async (game) => {
    if (isHttpsUrl(game.coverImageUrl)) {
      game.resolvedCoverImageUrl = game.coverImageUrl;
      return;
    }
    if (!autoFetch) {
      game.resolvedCoverImageUrl = null;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(cache, game.id)) {
      game.resolvedCoverImageUrl = cache[game.id];
      return;
    }
    const html = await fetchHtmlHead(game.officialWebsite);
    const found = html ? extractMetaImageUrl(html, game.officialWebsite) : null;
    game.resolvedCoverImageUrl = found;
    cache[game.id] = found;
    cacheChanged = true;
  });

  if (cacheChanged) {
    saveSettings({ coverImageCache: cache });
  }
  return games;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID_RE.test(value) && !RESERVED_IDS.has(value.toLowerCase());
}

function isValidCatalogItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!isSafeId(item.id)) return false;
  return REQUIRED_STRING_FIELDS
    .filter((field) => field !== 'id')
    .every((field) => isNonEmptyString(item[field]));
}

function sanitizeCatalogPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.games)) {
    throw new Error(
      'Formato de catalogo invalido: esperado um objeto JSON com a propriedade "games" (array). Veja docs/CATALOG_SCHEMA.md.'
    );
  }
  return {
    schemaVersion: payload.schemaVersion ?? 1,
    updatedAt: payload.updatedAt ?? null,
    games: payload.games.filter(isValidCatalogItem)
  };
}

async function fetchCatalogJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('A URL do catalogo precisa comecar com http:// ou https://');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao buscar o catalogo`);
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Tempo limite de ${Math.round(timeoutMs / 1000)}s excedido ao buscar o catalogo`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function syncCatalog() {
  const { catalogSourceUrl } = getSettings();

  if (!isNonEmptyString(catalogSourceUrl)) {
    return { games: [], offline: false, usedCache: false, sourceUrl: null, error: null };
  }

  try {
    const raw = await fetchCatalogJson(catalogSourceUrl);
    const sanitized = sanitizeCatalogPayload(raw);
    await resolveCoverImages(sanitized.games);

    saveSettings({
      catalogCacheRaw: sanitized,
      catalogLastSyncAt: new Date().toISOString()
    });

    return { games: sanitized.games, offline: false, usedCache: false, sourceUrl: catalogSourceUrl, error: null };
  } catch (err) {
    const cached = getSettings().catalogCacheRaw;
    if (cached && Array.isArray(cached.games)) {
      return { games: cached.games, offline: true, usedCache: true, sourceUrl: catalogSourceUrl, error: err.message };
    }
    return { games: [], offline: true, usedCache: false, sourceUrl: catalogSourceUrl, error: err.message };
  }
}

async function listGames() {
  const result = await syncCatalog();
  return result.games;
}

async function getGameById(id) {
  const games = await listGames();
  return games.find((g) => g.id === id) || null;
}

async function testConnection(candidateUrl) {
  if (!isNonEmptyString(candidateUrl)) {
    return { ok: false, error: 'Informe uma URL.' };
  }
  try {
    const raw = await fetchCatalogJson(candidateUrl);
    const sanitized = sanitizeCatalogPayload(raw);
    return {
      ok: true,
      totalItems: Array.isArray(raw.games) ? raw.games.length : 0,
      validItems: sanitized.games.length
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  syncCatalog,
  listGames,
  getGameById,
  testConnection,
  isValidCatalogItem,
  sanitizeCatalogPayload,
  extractMetaImageUrl,
  isHttpsUrl
};
