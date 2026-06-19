/**
 * PTT Live Desktop - Main Process
 * Intègre le serveur Node.js existant dans une application Electron
 */

const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// État de l'application
let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverStarted = false;

const SERVER_PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const isDev = process.argv.includes('--dev');

/**
 * Créer la fenêtre principale
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'PTT Live Server',
    backgroundColor: '#1a1a1a'
  });

  // Charger l'interface dashboard
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // DevTools en mode dev
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Cleanup à la fermeture
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Créer la tray icon (macOS/Linux)
 */
function createTray() {
  // TODO: créer une vraie icône
  // tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: serverStarted ? '🟢 Serveur actif' : '⚪ Serveur arrêté',
      enabled: false
    },
    {
      label: serverStarted ? 'Arrêter serveur' : 'Démarrer serveur',
      click: async () => {
        if (serverStarted) {
          await stopServer();
        } else {
          await startServer();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.quit();
      }
    }
  ]);

  if (tray) {
    tray.setContextMenu(contextMenu);
    tray.setToolTip('PTT Live Server');
  }
}

/**
 * Démarrer le serveur Node.js
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    if (serverProcess) {
      console.log('⚠️  Serveur déjà démarré');
      resolve({ success: false, message: 'Server already running' });
      return;
    }

    console.log('🚀 Démarrage du serveur PTT Live...');

    const serverPath = path.join(__dirname, '..', 'server', 'index.js');

    serverProcess = spawn('node', [serverPath], {
      cwd: path.join(__dirname, '..', 'server'),
      env: {
        ...process.env,
        PORT: SERVER_PORT,
        USE_LOCAL_LIVEKIT: 'true',
        NODE_ENV: isDev ? 'development' : 'production'
      }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Serveur]', output);

      // Transmettre les logs au renderer
      if (mainWindow) {
        mainWindow.webContents.send('server:log', {
          level: 'info',
          message: output.trim()
        });
      }

      // Détecter démarrage réussi
      if (output.includes('Serveur prêt') || output.includes('API REST démarrée')) {
        serverStarted = true;
        console.log('✅ Serveur démarré avec succès');

        if (mainWindow) {
          mainWindow.webContents.send('server:status', { running: true });
        }

        createTray(); // Mettre à jour tray
        resolve({ success: true, url: SERVER_URL });
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error('[Serveur Error]', output);

      if (mainWindow) {
        mainWindow.webContents.send('server:log', {
          level: 'error',
          message: output.trim()
        });
      }
    });

    serverProcess.on('error', (error) => {
      console.error('❌ Erreur démarrage serveur:', error);
      serverStarted = false;

      if (mainWindow) {
        mainWindow.webContents.send('server:status', { running: false, error: error.message });
      }

      reject(error);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`⚠️  Serveur arrêté (code: ${code}, signal: ${signal})`);
      serverProcess = null;
      serverStarted = false;

      if (mainWindow) {
        mainWindow.webContents.send('server:status', { running: false });
      }

      createTray(); // Mettre à jour tray
    });

    // Timeout de sécurité (15s)
    setTimeout(() => {
      if (!serverStarted && serverProcess) {
        console.log('⏱️  Timeout démarrage serveur (15s), vérification health...');

        // Vérifier que le serveur répond vraiment
        pingServer().then((health) => {
          if (health.success) {
            serverStarted = true;
            console.log('✅ Serveur répond au health check');

            if (mainWindow) {
              mainWindow.webContents.send('server:status', { running: true });
            }

            createTray();
            resolve({ success: true, url: SERVER_URL });
          } else {
            console.error('❌ Serveur ne répond pas après 15s');
            reject(new Error('Server startup timeout'));
          }
        });
      }
    }, 15000);
  });
}

/**
 * Arrêter le serveur Node.js
 */
async function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      console.log('⚠️  Aucun serveur à arrêter');
      resolve({ success: false, message: 'No server running' });
      return;
    }

    console.log('🛑 Arrêt du serveur...');

    serverProcess.on('exit', () => {
      serverProcess = null;
      serverStarted = false;
      console.log('✅ Serveur arrêté');

      if (mainWindow) {
        mainWindow.webContents.send('server:status', { running: false });
      }

      createTray();
      resolve({ success: true });
    });

    // Envoyer SIGTERM (shutdown gracieux)
    serverProcess.kill('SIGTERM');

    // Forcer après 5s si nécessaire
    setTimeout(() => {
      if (serverProcess) {
        console.log('⚠️  Force kill du serveur');
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
  });
}

/**
 * Tester si le serveur répond
 */
async function pingServer() {
  return new Promise((resolve) => {
    http.get(`${SERVER_URL}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ success: true, data: json });
        } catch (e) {
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    }).on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

// ========== App Lifecycle ==========

app.whenReady().then(async () => {
  // Setup IPC Handlers (doit être après app.whenReady)
  ipcMain.handle('server:start', async () => {
    return await startServer();
  });

  ipcMain.handle('server:stop', async () => {
    return await stopServer();
  });

  ipcMain.handle('server:status', async () => {
    if (!serverStarted) {
      return { running: false };
    }

    const health = await pingServer();
    return {
      running: health.success,
      health: health.data,
      url: SERVER_URL
    };
  });

  ipcMain.handle('server:ping', async () => {
    return await pingServer();
  });

  // Créer fenêtre
  createWindow();
  createTray();

  // Démarrer le serveur automatiquement
  console.log('🔄 Démarrage automatique du serveur...');
  await startServer();
});

app.on('window-all-closed', () => {
  // Ne pas quitter l'app sur macOS (comportement standard)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup au quit
app.on('before-quit', async (event) => {
  if (serverProcess) {
    event.preventDefault();
    console.log('🧹 Cleanup avant fermeture...');
    await stopServer();
    app.quit();
  }
});

// Gestion des erreurs non catchées
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur non catchée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejection non gérée:', reason);
});
