/**
 * PTT Live Desktop - Preload Script
 * Bridge sécurisé entre Main Process et Renderer Process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Même logique que dans main.js : doit rester synchronisé avec SERVER_URL
// (127.0.0.1 : le serveur n'écoute qu'en IPv4, voir le commentaire dans main.js)
const SERVER_PORT = process.env.PORT || 3000;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS !== 'false';
const SERVER_URL = `${ENABLE_HTTPS ? 'https' : 'http'}://127.0.0.1:${SERVER_PORT}`;

// Exposer l'API au renderer de manière sécurisée
contextBridge.exposeInMainWorld('electronAPI', {
  serverUrl: SERVER_URL,

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

  // QR Code (généré côté Main Process, pas de dépendance CDN)
  generateQRCode: (text) => ipcRenderer.invoke('qrcode:generate', text),

  // IP réseau locale (même détection que pour les certificats mkcert)
  getNetworkIP: () => ipcRenderer.invoke('network:ip'),

  // Helpers
  platform: process.platform,
  version: process.env.npm_package_version || '0.3.0'
});

console.log('✅ Preload script chargé');
