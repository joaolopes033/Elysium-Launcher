'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');

let WebTorrentCtor = null;
let client = null;
let clientPromise = null;

async function getClient() {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      if (!WebTorrentCtor) {
        const mod = await import('webtorrent');
        WebTorrentCtor = mod.default || mod;
      }
      let c;
      try {
        c = new WebTorrentCtor();
      } catch (err) {
        clientPromise = null;
        throw new Error(`Nao foi possivel iniciar o cliente de torrent: ${err.message}`);
      }
      c.on('error', (err) => {
        console.error('[torrentManager] erro no cliente webtorrent:', err && err.message);
      });
      client = c;
      return c;
    })();
  }
  return clientPromise;
}

const activeByGame = new Map();

const MAGNET_RE = /^magnet:\?xt=urn:btih:/i;
const TORRENT_URL_RE = /^https?:\/\/.+\.torrent(\?.*)?$/i;
const INFOHASH_RE = /^[a-f0-9]{40}$/i;

const NO_PEERS_TIMEOUT_MS = 90000;

const FALLBACK_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce'
];

function withFallbackTrackers(trackers) {
  const merged = new Set(Array.isArray(trackers) ? trackers : []);
  for (const t of FALLBACK_TRACKERS) merged.add(t);
  return [...merged];
}

let magnetDecode = null;
let magnetImportPromise = null;

async function getMagnetDecoder() {
  if (magnetDecode) return magnetDecode;
  if (!magnetImportPromise) {
    magnetImportPromise = import('magnet-uri').then((mod) => {
      magnetDecode = mod.default || mod;
      return magnetDecode;
    });
  }
  return magnetImportPromise;
}

async function extractMagnetParts(magnetUri) {
  const decode = await getMagnetDecoder();
  let parsed;
  try {
    parsed = decode(magnetUri);
  } catch {
    return { infoHash: null, trackers: [] };
  }
  const infoHash = typeof parsed.infoHash === 'string' && /^[a-f0-9]{40}$/i.test(parsed.infoHash)
    ? parsed.infoHash.toLowerCase()
    : null;
  const trackers = Array.isArray(parsed.announce)
    ? parsed.announce.filter((t) => typeof t === 'string' && t.length > 0)
    : [];
  return { infoHash, trackers };
}

function looksLikeBencodedTorrent(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 0 && buffer[0] === 0x64;
}

function fetchTorrentFile(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) {
      reject(new Error('Excesso de redirecionamentos ao buscar o arquivo .torrent.'));
      return;
    }
    const proto = url.startsWith('https') ? https : http;
    proto
      .get(url, { headers: { 'User-Agent': 'ElysiumLauncher/0.1' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchTorrentFile(res.headers.location, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Falha ao baixar o arquivo .torrent (HTTP ${res.statusCode}).`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (buf.length === 0) {
            reject(new Error('Arquivo .torrent baixado veio vazio.'));
            return;
          }
          if (!looksLikeBencodedTorrent(buf)) {
            reject(new Error('O conteudo baixado nao parece ser um arquivo .torrent valido (nao comeca como bencode).'));
            return;
          }
          resolve(buf);
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function isValidTorrentSource(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && (MAGNET_RE.test(value) || TORRENT_URL_RE.test(value) || INFOHASH_RE.test(value));
}

async function addTorrent(torrentSource, downloadPath, gameId) {
  if (!isValidTorrentSource(torrentSource)) {
    throw new Error(`Identificador de torrent invalido para o jogo "${gameId}": ${JSON.stringify(torrentSource)}`);
  }

  if (activeByGame.has(gameId)) {
    const existing = activeByGame.get(gameId);
    return existing.torrent ? existing.torrent.infoHash : null;
  }
  const entry = { torrent: null, status: 'metadados', noPeersTimeout: null };
  activeByGame.set(gameId, entry);

  try {
    fs.mkdirSync(downloadPath, { recursive: true });
    const c = await getClient();

    let torrentId = torrentSource;
    const addOpts = { path: downloadPath };

    if (MAGNET_RE.test(torrentSource)) {
      const { infoHash, trackers } = await extractMagnetParts(torrentSource);
      if (infoHash) {
        torrentId = infoHash;
        addOpts.announce = withFallbackTrackers(trackers);
      }
    } else if (TORRENT_URL_RE.test(torrentSource)) {
      torrentId = await fetchTorrentFile(torrentSource);
    } else if (INFOHASH_RE.test(torrentSource)) {
      addOpts.announce = withFallbackTrackers([]);
    }

    let torrent;
    try {
      torrent = c.add(torrentId, addOpts);
    } catch (err) {
      throw new Error(`Falha ao adicionar torrent: ${err.message}`);
    }

    entry.torrent = torrent;

    entry.noPeersTimeout = setTimeout(() => {
      const current = activeByGame.get(gameId);
      if (current && current.status === 'metadados' && current.torrent && (current.torrent.numPeers || 0) === 0) {
        current.status = 'sem-peers';
      }
    }, NO_PEERS_TIMEOUT_MS);

    torrent.on('ready', () => {
      clearTimeout(entry.noPeersTimeout);
      const current = activeByGame.get(gameId);
      if (current) current.status = 'baixando';
    });

    torrent.on('error', (err) => {
      clearTimeout(entry.noPeersTimeout);
      console.error(`[torrentManager] erro no torrent do jogo "${gameId}":`, err && err.message);
      const current = activeByGame.get(gameId);
      if (current) current.status = 'erro';
    });

    return torrent.infoHash;
  } catch (err) {
    activeByGame.delete(gameId);
    throw err;
  }
}

function pause(gameId) {
  const entry = activeByGame.get(gameId);
  if (!entry || !entry.torrent) return false;
  entry.torrent.pause();
  entry.status = 'pausado';
  return true;
}

function resume(gameId) {
  const entry = activeByGame.get(gameId);
  if (!entry || !entry.torrent) return false;
  entry.torrent.resume();
  entry.status = entry.torrent.ready ? 'baixando' : 'metadados';
  return true;
}

function cancel(gameId, { deleteFiles = false } = {}) {
  const entry = activeByGame.get(gameId);
  if (!entry) return false;
  clearTimeout(entry.noPeersTimeout);
  if (entry.torrent) {
    entry.torrent.destroy({ destroyStore: deleteFiles }, () => {});
  }
  activeByGame.delete(gameId);
  return true;
}

function isActive(gameId) {
  return activeByGame.has(gameId);
}

function markPendingAsErrored(message) {
  let affected = 0;
  for (const [gameId, entry] of activeByGame.entries()) {
    if (entry.status === 'metadados' || entry.status === 'sem-peers') {
      clearTimeout(entry.noPeersTimeout);
      entry.status = 'erro';
      entry.errorMessage = message;
      affected++;
      console.error(`[torrentManager] marcando "${gameId}" como erro apos falha nao tratada.`);
    }
  }
  return affected;
}

function detachFromList(gameId) {
  const entry = activeByGame.get(gameId);
  if (entry) clearTimeout(entry.noPeersTimeout);
  activeByGame.delete(gameId);
}

function listStatuses() {
  const out = [];
  for (const [gameId, entry] of activeByGame.entries()) {
    if (!entry.torrent) {
      out.push({
        gameId, type: 'torrent', status: entry.status,
        progress: 0, downloaded: 0, length: 0, downloadSpeed: 0, uploadSpeed: 0, numPeers: 0,
      });
      continue;
    }
    const t = entry.torrent;
    if (t.done && entry.status !== 'concluido') {
      entry.status = 'concluido';
    }
    out.push({
      gameId,
      type: 'torrent',
      status: entry.status,
      progress: t.progress || 0,
      downloaded: t.downloaded || 0,
      length: t.length || 0,
      downloadSpeed: t.downloadSpeed || 0,
      uploadSpeed: t.uploadSpeed || 0,
      numPeers: t.numPeers || 0,
    });
  }
  return out;
}

function shutdown() {
  return new Promise((resolve) => {
    for (const entry of activeByGame.values()) clearTimeout(entry.noPeersTimeout);
    if (!client) {
      resolve();
      return;
    }
    client.destroy((err) => {
      if (err) console.error('[torrentManager] erro ao encerrar cliente:', err.message);
      resolve();
    });
  });
}

module.exports = {
  addTorrent,
  pause,
  resume,
  cancel,
  isActive,
  detachFromList,
  listStatuses,
  shutdown,
  isValidTorrentSource,
  markPendingAsErrored,
  extractMagnetParts,
  looksLikeBencodedTorrent,
  withFallbackTrackers,
  FALLBACK_TRACKERS
};
