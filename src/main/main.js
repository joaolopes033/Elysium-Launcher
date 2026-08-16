'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const catalog = require('./catalog');
const store = require('./store');
const torrentManager = require('./torrentManager');
const httpDownloader = require('./httpDownloader');
const { registerCatalogIpc, registerLegalNoticeIpc } = require('./ipc-handlers');

let mainWindow = null;
let progressInterval = null;

app.setName('Elysium Launcher');

process.on('unhandledRejection', (reason) => {
  console.error('[main] Promise rejeitada sem tratamento:', reason && reason.stack || reason);
  torrentManager.markPendingAsErrored('Erro interno no motor de torrent. Tente novamente.');
  syncErroredDownloadsToLibrary();
});

function syncErroredDownloadsToLibrary() {
  let changed = false;
  for (const s of torrentManager.listStatuses()) {
    if (s.status === 'erro') {
      const lib = store.getLibrary();
      if (lib[s.gameId] && lib[s.gameId].status !== 'erro') {
        store.updateLibraryEntry(s.gameId, {
          status: 'erro',
          errorMessage: 'Erro interno no motor de torrent. Tente novamente.',
        });
        changed = true;
      }
    }
  }
  if (changed) broadcastLibrary();
}
process.on('uncaughtException', (err) => {
  console.error('[main] Excecao nao capturada:', err && err.stack || err);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0e1621',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function currentDownloads() {
  return [...torrentManager.listStatuses(), ...httpDownloader.listStatuses()];
}

function ensureProgressLoop() {
  if (progressInterval) return;
  progressInterval = setInterval(() => {
    const downloads = currentDownloads();
    send('downloads:progress', downloads);
    if (downloads.length === 0) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }, 800);
}

function broadcastLibrary() {
  send('library:changed', store.getLibrary());
}

async function installGame(gameId) {
  const game = await catalog.getGameById(gameId);
  if (!game) {
    throw new Error('Jogo nao encontrado no catalogo.');
  }

  const settings = store.getSettings();
  const destDir = path.join(settings.downloadPath, game.id);

  const resolvedBase = path.resolve(settings.downloadPath) + path.sep;
  const resolvedDest = path.resolve(destDir) + path.sep;
  if (!resolvedDest.startsWith(resolvedBase)) {
    throw new Error('Id de jogo invalido: caminho de instalacao fora da pasta de downloads.');
  }

  fs.mkdirSync(destDir, { recursive: true });

  store.updateLibraryEntry(gameId, {
    status: 'baixando',
    path: destDir,
    source: game.download && game.download.torrent ? 'torrent' : 'http',
    installedAt: new Date().toISOString(),
  });
  broadcastLibrary();

  const hasTorrent = game.download && game.download.torrent;
  const hasDirect = game.download && game.download.direct;

  try {
    if (hasTorrent) {
      ensureProgressLoop();
      torrentManager
        .addTorrent(game.download.torrent, destDir, gameId)
        .then(() => watchTorrent(gameId, destDir))
        .catch((err) => onInstallError(gameId, err));
      return { ok: true, mode: 'torrent' };
    }

    if (hasDirect) {
      const fileName = safeFileNameFromUrl(game.download.direct) || `${game.id}.zip`;
      const destFile = path.join(destDir, fileName);
      ensureProgressLoop();
      httpDownloader
        .startDownload(gameId, game.download.direct, destFile)
        .then(() => onDownloadComplete(gameId, destDir))
        .catch((err) => onInstallError(gameId, err));
      return { ok: true, mode: 'http' };
    }

    const target = game.downloadPage || game.officialWebsite;
    openExternalSafe(target);
    store.updateLibraryEntry(gameId, { status: 'manual', path: destDir });
    broadcastLibrary();
    return { ok: true, mode: 'manual' };
  } catch (err) {
    onInstallError(gameId, err);
    throw err;
  }
}

function safeFileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    return base || null;
  } catch {
    return null;
  }
}

function onInstallError(gameId, err) {
  console.error(`[main] erro instalando ${gameId}:`, err && err.message);
  store.updateLibraryEntry(gameId, { status: 'erro', errorMessage: err && err.message });
  broadcastLibrary();
}

function onDownloadComplete(gameId, destDir) {
  store.updateLibraryEntry(gameId, { status: 'baixado', path: destDir });
  broadcastLibrary();
}

function watchTorrent(gameId, destDir) {
  const check = setInterval(() => {
    const statuses = torrentManager.listStatuses();
    const entry = statuses.find((s) => s.gameId === gameId);
    if (!entry) {
      clearInterval(check);
      return;
    }
    if (entry.status === 'concluido') {
      clearInterval(check);
      onDownloadComplete(gameId, destDir);
      setTimeout(() => torrentManager.detachFromList(gameId), 4000);
    } else if (entry.status === 'erro') {
      clearInterval(check);
      onInstallError(gameId, new Error('O torrent encontrou um erro durante o download.'));
    }
  }, 1000);
}

function openExternalSafe(url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
    return true;
  }
  return false;
}

function guessExecutable(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const exeCandidates = entries
      .filter((e) => e.isFile() && /\.(exe)$/i.test(e.name))
      .map((e) => path.join(dir, e.name));
    if (exeCandidates.length === 1) return exeCandidates[0];
    const dirs = entries.filter((e) => e.isDirectory());
    if (exeCandidates.length === 0 && dirs.length === 1) {
      return guessExecutable(path.join(dir, dirs[0].name));
    }
    return null;
  } catch {
    return null;
  }
}

registerCatalogIpc();

registerLegalNoticeIpc();

ipcMain.handle('library:list', () => store.getLibrary());

ipcMain.handle('game:install', (_e, gameId) => installGame(gameId));

ipcMain.handle('game:uninstall', (_e, gameId) => {
  const lib = store.getLibrary();
  const entry = lib[gameId];
  if (entry && entry.path && fs.existsSync(entry.path)) {
    try {
      fs.rmSync(entry.path, { recursive: true, force: true });
    } catch (err) {
      console.error(`[main] erro ao apagar arquivos de ${gameId}:`, err.message);
      return { ok: false, error: `Nao foi possivel apagar os arquivos (${err.message}). Feche o jogo, se estiver aberto, e tente de novo.` };
    }
  }
  store.removeLibraryEntry(gameId);
  broadcastLibrary();
  return { ok: true };
});

ipcMain.handle('game:play', (_e, gameId) => {
  const lib = store.getLibrary();
  const entry = lib[gameId];
  if (!entry) return { ok: false, reason: 'nao-instalado' };

  let exePath = entry.executablePath;
  if (!exePath && entry.path) {
    exePath = guessExecutable(entry.path);
    if (exePath) {
      store.updateLibraryEntry(gameId, { executablePath: exePath });
    }
  }
  if (!exePath || !fs.existsSync(exePath)) {
    return { ok: false, reason: 'sem-executavel' };
  }

  try {
    const child = spawn(exePath, [], { cwd: path.dirname(exePath), detached: true, stdio: 'ignore' });
    child.unref();
    store.updateLibraryEntry(gameId, { lastPlayedAt: new Date().toISOString() });
    broadcastLibrary();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'falha-ao-abrir', message: err.message };
  }
});

ipcMain.handle('game:openFolder', (_e, gameId) => {
  const entry = store.getLibrary()[gameId];
  if (entry && entry.path && fs.existsSync(entry.path)) {
    shell.openPath(entry.path);
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('game:setExecutable', async (_e, gameId) => {
  const entry = store.getLibrary()[gameId];
  const defaultPath = entry && entry.path ? entry.path : app.getPath('downloads');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar executavel do jogo',
    defaultPath,
    properties: ['openFile'],
    filters:
      process.platform === 'win32'
        ? [{ name: 'Executaveis', extensions: ['exe'] }]
        : [{ name: 'Todos os arquivos', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false };
  }
  const exePath = result.filePaths[0];
  store.updateLibraryEntry(gameId, { executablePath: exePath });
  broadcastLibrary();
  return { ok: true, executablePath: exePath };
});

ipcMain.handle('downloads:list', () => currentDownloads());

ipcMain.handle('downloads:pause', (_e, gameId) => {
  return { ok: torrentManager.pause(gameId) };
});

ipcMain.handle('downloads:resume', (_e, gameId) => {
  return { ok: torrentManager.resume(gameId) };
});

ipcMain.handle('downloads:cancel', (_e, gameId) => {
  const info = currentDownloads().find((d) => d.gameId === gameId);
  const alreadyDone = info && info.status === 'concluido';

  const wasTorrent = torrentManager.isActive(gameId);
  const wasHttp = httpDownloader.isActive(gameId);
  if (wasTorrent) torrentManager.cancel(gameId, { deleteFiles: !alreadyDone });
  if (wasHttp) httpDownloader.cancelDownload(gameId, { deleteFile: !alreadyDone });
  if ((wasTorrent || wasHttp) && !alreadyDone) {
    store.removeLibraryEntry(gameId);
    broadcastLibrary();
  }
  return { ok: wasTorrent || wasHttp };
});

ipcMain.handle('settings:get', () => store.getSettings());
ipcMain.handle('settings:set', (_e, patch) => store.saveSettings(patch || {}));

ipcMain.handle('dialog:selectFolder', async () => {
  const current = store.getSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher pasta de downloads',
    defaultPath: current.downloadPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('shell:openExternal', (_e, url) => ({ ok: openExternalSafe(url) }));
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow && mainWindow.close());

app.whenReady().then(() => {
  reconcileLibraryOnStartup();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function reconcileLibraryOnStartup() {
  const lib = store.getLibrary();
  let changed = false;
  for (const [gameId, entry] of Object.entries(lib)) {
    if (entry.status === 'baixando') {
      lib[gameId] = {
        ...entry,
        status: 'erro',
        errorMessage: 'Download interrompido (o aplicativo foi fechado antes de terminar). Clique em instalar novamente.',
      };
      changed = true;
    }
  }
  if (changed) store.saveLibrary(lib);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (progressInterval) clearInterval(progressInterval);
  event.preventDefault();
  await torrentManager.shutdown();
  app.exit(0);
});
