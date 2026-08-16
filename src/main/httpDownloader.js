'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const activeByGame = new Map();

function startDownload(gameId, url, destPath, { redirectsLeft = 5 } = {}) {
  return new Promise((resolve, reject) => {
    if (activeByGame.has(gameId)) {
      reject(new Error(`Ja existe um download em andamento para "${gameId}".`));
      return;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const proto = url.startsWith('https') ? https : http;

    const record = {
      status: 'baixando',
      downloaded: 0,
      total: 0,
      speed: 0,
      destPath,
      req: null,
      fileStream: null,
    };
    activeByGame.set(gameId, record);

    let lastBytes = 0;
    let lastTime = Date.now();

    const req = proto.get(url, { headers: { 'User-Agent': 'ElysiumLauncher/0.1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          record.status = 'erro';
          reject(new Error('Excesso de redirecionamentos.'));
          return;
        }
        activeByGame.delete(gameId);
        startDownload(gameId, res.headers.location, destPath, { redirectsLeft: redirectsLeft - 1 })
          .then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        record.status = 'erro';
        reject(new Error(`Download falhou (HTTP ${res.statusCode})`));
        return;
      }

      record.total = parseInt(res.headers['content-length'] || '0', 10);
      const fileStream = fs.createWriteStream(destPath);
      record.fileStream = fileStream;

      res.on('data', (chunk) => {
        record.downloaded += chunk.length;
        const now = Date.now();
        const elapsed = now - lastTime;
        if (elapsed > 500) {
          record.speed = ((record.downloaded - lastBytes) / elapsed) * 1000;
          lastBytes = record.downloaded;
          lastTime = now;
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        record.status = 'concluido';
        record.speed = 0;
        resolve(destPath);
        setTimeout(() => activeByGame.delete(gameId), 4000);
      });

      fileStream.on('error', (err) => {
        record.status = 'erro';
        reject(err);
      });
    });

    req.on('error', (err) => {
      record.status = 'erro';
      reject(err);
    });

    req.setTimeout(30000, () => {
      record.status = 'erro';
      req.destroy(new Error('Tempo esgotado — sem resposta do servidor.'));
    });

    record.req = req;
  });
}

function cancelDownload(gameId, { deleteFile = true } = {}) {
  const entry = activeByGame.get(gameId);
  if (!entry) return false;
  if (entry.req) entry.req.destroy();
  if (entry.fileStream) entry.fileStream.close();
  if (deleteFile && entry.destPath) {
    fs.unlink(entry.destPath, () => {});
  }
  activeByGame.delete(gameId);
  return true;
}

function isActive(gameId) {
  return activeByGame.has(gameId);
}

function listStatuses() {
  const out = [];
  for (const [gameId, r] of activeByGame.entries()) {
    out.push({
      gameId,
      type: 'http',
      status: r.status,
      progress: r.total > 0 ? r.downloaded / r.total : 0,
      indeterminate: r.total <= 0 && r.status === 'baixando',
      downloaded: r.downloaded,
      length: r.total,
      downloadSpeed: r.speed,
      uploadSpeed: 0,
      numPeers: 0,
    });
  }
  return out;
}

module.exports = { startDownload, cancelDownload, isActive, listStatuses };
