/**
 * PTT Live Desktop - Main Process
 * Intègre le serveur Node.js existant dans une application Electron
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const QRCode = require('qrcode');
const yaml = require('yaml');
const setupHelper = require('./setup-helper');

const CONFIG_PATH = path.join(__dirname, '..', 'server', 'config', 'config.yaml');

function readConfig() {
  return yaml.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, yaml.stringify(config), 'utf8');
}

function slugify(text) {
  return text.toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
}

// État de l'application
let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverStarted = false;
let rendererReady = false;

const SERVER_PORT = process.env.PORT || 3000;
// HTTPS activé par défaut (cohérent avec le setup mkcert automatique au premier
// lancement) ; ENABLE_HTTPS=false permet de revenir explicitement en HTTP
const ENABLE_HTTPS = process.env.ENABLE_HTTPS !== 'false';
const SERVER_PROTOCOL = ENABLE_HTTPS ? 'https' : 'http';
// 127.0.0.1 plutôt que localhost : le serveur n'écoute qu'en IPv4 (host: 0.0.0.0
// dans config.yaml), or le Node embarqué par Electron peut résoudre "localhost"
// en IPv6 (::1) en priorité, ce qui ferait échouer silencieusement le ping
const SERVER_URL = `${SERVER_PROTOCOL}://127.0.0.1:${SERVER_PORT}`;
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

  // Attendre que le renderer soit prêt
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    console.log('✅ Interface chargée');

    // Envoyer l'état initial du serveur
    if (mainWindow) {
      mainWindow.webContents.send('server:status', { running: serverStarted });
    }
  });

  // DevTools en mode dev
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Cleanup à la fermeture
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
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
        ENABLE_HTTPS: ENABLE_HTTPS ? 'true' : 'false',
        NODE_ENV: isDev ? 'development' : 'production'
      }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Serveur]', output);

      // Transmettre les logs au renderer (seulement si prêt)
      if (mainWindow && rendererReady) {
        mainWindow.webContents.send('server:log', {
          level: 'info',
          message: output.trim()
        });
      }

      // Détecter démarrage réussi
      if (output.includes('Serveur prêt') || output.includes('API REST démarrée')) {
        serverStarted = true;
        console.log('✅ Serveur démarré avec succès');

        if (mainWindow && rendererReady) {
          mainWindow.webContents.send('server:status', { running: true });
        }

        createTray(); // Mettre à jour tray
        resolve({ success: true, url: SERVER_URL });
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();

      // LiveKit envoie INFO/WARN dans stderr (comportement normal Go)
      // Ne les traiter comme erreurs que s'ils contiennent vraiment "ERROR"
      const isError = output.includes('ERROR') || output.includes('Error:');

      console.log(isError ? '[Serveur Error]' : '[Serveur]', output);

      if (mainWindow && rendererReady) {
        mainWindow.webContents.send('server:log', {
          level: isError ? 'error' : 'info',
          message: output.trim()
        });
      }

      // Détecter démarrage LiveKit dans stderr
      if (output.includes('starting LiveKit server') || output.includes('Serveur prêt')) {
        if (!serverStarted) {
          serverStarted = true;
          console.log('✅ Serveur démarré (détecté via stderr)');

          if (mainWindow && rendererReady) {
            mainWindow.webContents.send('server:status', { running: true });
          }

          createTray();
          resolve({ success: true, url: SERVER_URL });
        }
      }
    });

    serverProcess.on('error', (error) => {
      console.error('❌ Erreur démarrage serveur:', error);
      serverStarted = false;

      if (mainWindow && rendererReady) {
        mainWindow.webContents.send('server:status', { running: false, error: error.message });
      }

      reject(error);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`⚠️  Serveur arrêté (code: ${code}, signal: ${signal})`);
      serverProcess = null;
      serverStarted = false;

      if (mainWindow && rendererReady) {
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
    const client = ENABLE_HTTPS ? https : http;
    // rejectUnauthorized: false : le cert mkcert est approuvé par le Keychain
    // macOS (Safari/Chrome/Electron renderer), mais le module https de Node
    // ne lit pas ce trust store et rejetterait sinon ce ping vers notre
    // propre serveur local.
    const options = ENABLE_HTTPS ? { rejectUnauthorized: false } : {};
    client.get(`${SERVER_URL}/health`, options, (res) => {
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
      error: health.error,
      url: SERVER_URL
    };
  });

  ipcMain.handle('server:ping', async () => {
    return await pingServer();
  });

  ipcMain.handle('qrcode:generate', async (event, text) => {
    try {
      const dataUrl = await QRCode.toDataURL(text, { width: 256, margin: 2 });
      return { success: true, dataUrl };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('network:ip', async () => {
    return setupHelper.getNetworkIP();
  });

  // ========== Groupes (lecture/écriture YAML directe, sans serveur) ==========

  ipcMain.handle('groups:list', () => {
    try {
      const config = readConfig();
      return { groups: config.groups || [] };
    } catch (error) {
      return { groups: [], error: error.message };
    }
  });

  ipcMain.handle('groups:create', (event, { name, audioBitrate }) => {
    try {
      const config = readConfig();
      const id = slugify(name);
      if ((config.groups || []).find(g => slugify(g.name) === id)) {
        return { success: false, error: `Un groupe "${name}" existe déjà` };
      }
      const group = { name, ...(audioBitrate ? { audioBitrate } : {}) };
      config.groups = [...(config.groups || []), group];
      writeConfig(config);
      return { success: true, group };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:update', (event, { id, name, audioBitrate }) => {
    try {
      const config = readConfig();
      const idx = (config.groups || []).findIndex(g => slugify(g.name) === id);
      if (idx === -1) return { success: false, error: `Groupe ${id} introuvable` };
      if (name !== undefined) config.groups[idx].name = name;
      if (audioBitrate !== undefined) config.groups[idx].audioBitrate = audioBitrate;
      writeConfig(config);
      return { success: true, group: config.groups[idx] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:delete', (event, { id }) => {
    try {
      const config = readConfig();
      const idx = (config.groups || []).findIndex(g => slugify(g.name) === id);
      if (idx === -1) return { success: false, error: `Groupe ${id} introuvable` };
      config.groups.splice(idx, 1);
      writeConfig(config);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:export', async () => {
    const configPath = path.join(__dirname, '..', 'server', 'config', 'config.yaml');

    try {
      const content = fs.readFileSync(configPath, 'utf8');

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Exporter la configuration',
        defaultPath: 'config.yaml',
        filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }]
      });

      if (!filePath) return { success: false, cancelled: true };

      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:import', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer une configuration',
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
      properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };

    try {
      const content = fs.readFileSync(filePaths[0], 'utf8');
      const configPath = path.join(__dirname, '..', 'server', 'config', 'config.yaml');

      // Backup de l'ancienne config avant remplacement
      if (fs.existsSync(configPath)) {
        fs.copyFileSync(configPath, configPath + '.bak');
      }

      fs.writeFileSync(configPath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Créer fenêtre
  createWindow();
  createTray();

  // Vérifier setup automatique (certificats)
  console.log('🔍 Vérification configuration...');
  const projectRoot = path.join(__dirname, '..');
  const certsDir = path.join(projectRoot, 'certs');

  if (!setupHelper.certificatesExist(certsDir)) {
    console.log('⚠️  Certificats SSL manquants, configuration automatique...\n');

    // Afficher dialog d'information
    const infoResult = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Configuration initiale',
      message: 'Première utilisation de PTT Live',
      detail: 'Configuration des certificats SSL en cours...\nCela peut prendre 1-2 minutes.\n\nmkcert sera installé automatiquement.',
      buttons: ['Continuer', 'Annuler']
    });

    if (infoResult.response === 1) {
      console.log('⚠️  Configuration annulée par l\'utilisateur');
      return;
    }

    // Lancer setup auto
    const setupResult = await setupHelper.autoSetup(projectRoot);

    if (!setupResult.success) {
      // Échec du setup automatique
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Configuration échouée',
        message: 'Impossible de configurer automatiquement les certificats SSL',
        detail: setupResult.manual
          ? 'Veuillez exécuter manuellement :\n./setup-certificates.sh\n\nOu installer mkcert : https://github.com/FiloSottile/mkcert'
          : setupResult.error,
        buttons: ['OK']
      });

      console.error('❌ Setup automatique échoué');
      return; // Ne pas démarrer le serveur
    }

    // Setup réussi
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Configuration terminée',
      message: 'Certificats SSL configurés avec succès !',
      detail: `Votre IP réseau : ${setupResult.networkIP}\n\nLe serveur va démarrer...`,
      buttons: ['OK']
    });

    console.log('✅ Setup automatique terminé\n');
  } else {
    console.log('✅ Certificats présents\n');
  }

  // NE PAS démarrer automatiquement
  // L'utilisateur cliquera sur "Démarrer" dans l'interface
  console.log('✅ Application prête');
  console.log('💡 Cliquez sur "Démarrer" pour lancer le serveur\n');
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
