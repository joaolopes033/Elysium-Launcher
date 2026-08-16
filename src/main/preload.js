'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel) {
  return (...args) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('elysium', {
  catalog: {
    list: invoke('catalog:list'),
    get: invoke('catalog:get'),
    sync: invoke('catalog:sync'),
    testConnection: invoke('catalog:test-connection'),
  },
  library: {
    list: invoke('library:list'),
  },
  game: {
    install: invoke('game:install'),
    uninstall: invoke('game:uninstall'),
    play: invoke('game:play'),
    openFolder: invoke('game:openFolder'),
    setExecutable: invoke('game:setExecutable'),
  },
  downloads: {
    list: invoke('downloads:list'),
    pause: invoke('downloads:pause'),
    resume: invoke('downloads:resume'),
    cancel: invoke('downloads:cancel'),
    onProgress: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('downloads:progress', listener);
      return () => ipcRenderer.removeListener('downloads:progress', listener);
    },
  },
  library_events: {
    onChanged: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('library:changed', listener);
      return () => ipcRenderer.removeListener('library:changed', listener);
    },
  },
  settings: {
    get: invoke('settings:get'),
    set: invoke('settings:set'),
    chooseDownloadFolder: invoke('dialog:selectFolder'),
  },
  legalNotice: {
    getStatus: invoke('legal-notice:get-status'),
    accept: invoke('legal-notice:accept'),
    decline: invoke('legal-notice:decline'),
    getDocument: invoke('legal-notice:get-document'),
  },
  system: {
    openExternal: invoke('shell:openExternal'),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  app: {
    getVersion: invoke('app:getVersion'),
  },
});
