'use strict';

const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');
const catalog = require('./catalog');
const { getSettings, saveSettings } = require('./store');

const LEGAL_NOTICE_VERSION = '1.0.0';

function registerCatalogIpc() {
  ipcMain.handle('catalog:list', () => catalog.listGames());
  ipcMain.handle('catalog:get', (_event, id) => catalog.getGameById(id));
  ipcMain.handle('catalog:sync', () => catalog.syncCatalog());
  ipcMain.handle('catalog:test-connection', (_event, url) => catalog.testConnection(url));
}

function registerLegalNoticeIpc() {
  ipcMain.handle('legal-notice:get-status', () => {
    const { legalNoticeAccepted, legalNoticeVersion } = getSettings();
    const accepted = legalNoticeAccepted === true;
    return {
      accepted,
      acceptedVersion: legalNoticeVersion,
      currentVersion: LEGAL_NOTICE_VERSION,
      needsAcceptance: !accepted || legalNoticeVersion !== LEGAL_NOTICE_VERSION
    };
  });

  ipcMain.handle('legal-notice:accept', () => {
    saveSettings({
      legalNoticeAccepted: true,
      legalNoticeAcceptedAt: new Date().toISOString(),
      legalNoticeVersion: LEGAL_NOTICE_VERSION
    });
    return { accepted: true };
  });

  ipcMain.handle('legal-notice:decline', () => {
    app.quit();
  });

  ipcMain.handle('legal-notice:get-document', () => {
    const legalPath = path.join(app.getAppPath(), 'LEGAL.md');
    try {
      return { ok: true, content: fs.readFileSync(legalPath, 'utf-8') };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerCatalogIpc, registerLegalNoticeIpc, LEGAL_NOTICE_VERSION };
