'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function userDataFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readJSON(name, fallback) {
  try {
    const p = userDataFile(name);
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Falha lendo ${name}:`, err.message);
    return fallback;
  }
}

function writeJSON(name, data) {
  try {
    const p = userDataFile(name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
    return true;
  } catch (err) {
    console.error(`[store] Falha salvando ${name}:`, err.message);
    return false;
  }
}

function getLibrary() {
  return readJSON('library.json', {});
}

function saveLibrary(lib) {
  return writeJSON('library.json', lib);
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function updateLibraryEntry(gameId, patch) {
  if (typeof gameId !== 'string' || RESERVED_KEYS.has(gameId)) return getLibrary();
  const lib = getLibrary();
  lib[gameId] = { ...(lib[gameId] || {}), ...patch };
  saveLibrary(lib);
  return lib;
}

function removeLibraryEntry(gameId) {
  if (typeof gameId !== 'string' || RESERVED_KEYS.has(gameId)) return getLibrary();
  const lib = getLibrary();
  delete lib[gameId];
  saveLibrary(lib);
  return lib;
}

function defaultSettings() {
  return {
    downloadPath: path.join(app.getPath('downloads'), 'ElysiumLauncher'),
    closeToTray: false,

    catalogSourceUrl: null,
    catalogLastSyncAt: null,
    catalogCacheRaw: null,

    autoFetchCoverImages: true,
    coverImageCache: {},

    legalNoticeAccepted: false,
    legalNoticeAcceptedAt: null,
    legalNoticeVersion: null,
  };
}

function getSettings() {
  return { ...defaultSettings(), ...readJSON('settings.json', {}) };
}

function saveSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  writeJSON('settings.json', merged);
  return merged;
}

module.exports = {
  getLibrary,
  saveLibrary,
  updateLibraryEntry,
  removeLibraryEntry,
  getSettings,
  saveSettings,
};
