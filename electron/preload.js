/**
 * PTT Live Desktop - Preload Script
 * Bridge sécurisé entre Main Process et Renderer Process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Exposer l'API au renderer de manière sécurisée
contextBridge.exposeInMainWorld('electronAPI', {
  // Contrôle serveur
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    status: () => ipcRenderer.invoke('server:status'),
    ping: () => ipcRenderer.invoke('server:ping'),

    // Écouter les événements du serveur
    onStatus: (callback) => {
      ipcRenderer.on('server:status', (event, data) => callback(data));
    },
    onLog: (callback) => {
      ipcRenderer.on('server:log', (event, data) => callback(data));
    }
  },

  // Helpers
  platform: process.platform,
  version: process.env.npm_package_version || '0.3.0'
});

console.log('✅ Preload script chargé');
