#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces } from 'os';
import YAML from 'yaml';
import { AccessToken } from 'livekit-server-sdk';
import adminRouter, { registerUser, addLog } from './api/admin.js';
import configManager from './config/ConfigManager.js';
import audioBridgeManager from './bridge/AudioBridgeManager.js';
import AudioLevelsServer from './websocket/AudioLevelsServer.js';
import { setGlobalLogLevel } from './utils/Logger.js';
import httpProxy from 'http-proxy';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Chargement configuration via ConfigManager
const config = configManager.get();

// Configure le niveau de log
const logLevel = config.logging?.level?.toUpperCase() || 'INFO';
setGlobalLogLevel(logLevel);
console.log(`📊 Niveau de log: ${logLevel}`);

// Note: Les IDs sont maintenant générés automatiquement par le ConfigManager

/**
 * Détecte l'IP réseau locale (WiFi/Ethernet)
 * @returns {string|null} IP réseau ou null si non trouvée
 */
function getNetworkIP() {
  const nets = networkInterfaces();

  // Priorité : WiFi (en0 sur macOS) > Ethernet (en1)
  const priorityInterfaces = ['en0', 'en1', 'eth0', 'wlan0'];

  for (const interfaceName of priorityInterfaces) {
    const interfaces = nets[interfaceName];
    if (interfaces) {
      for (const net of interfaces) {
        // IPv4, non-interne
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  // Fallback : première IP non-interne trouvée
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return null;
}

// Variables d'environnement
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const USE_LOCAL_LIVEKIT = process.env.USE_LOCAL_LIVEKIT === 'true';
const SERVER_PORT = parseInt(process.env.PORT || config.server.port, 10);
const SERVER_HOST = config.server.host;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';

// Configuration URL LiveKit
let LIVEKIT_URL = process.env.LIVEKIT_URL || config.server.livekit.url;

// AUTO : détection automatique de l'IP réseau
if (LIVEKIT_URL === 'AUTO') {
  const networkIP = getNetworkIP();
  if (networkIP) {
    LIVEKIT_URL = `ws://${networkIP}:7880`;
  } else {
    console.warn('⚠️  IP réseau non détectée, utilisation de localhost');
    LIVEKIT_URL = 'ws://localhost:7880';
  }
}

// Logging
const LOG_LEVEL = config.logging.level;

function log(level, ...args) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configLevel = levels[LOG_LEVEL] || 1;
  const msgLevel = levels[level] || 1;

  if (msgLevel >= configLevel) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);

    // Ajouter au système de logs admin
    addLog(level, args.join(' '));
  }
}

// ========== Démarrage LiveKit Server ==========

let livekitProcess = null;

function startLiveKitServer() {
  return new Promise((resolve, reject) => {
    // Détection du binaire LiveKit :
    // 1. Binaire local (Linux après install.sh) : server/bin/livekit-server
    // 2. Binaire Homebrew (macOS) : livekit-server dans PATH
    const localBinary = join(__dirname, 'bin', 'livekit-server');
    const livekitBinary = existsSync(localBinary) ? localBinary : 'livekit-server';

    log('info', 'Démarrage LiveKit Server...');
    log('debug', 'Commande:', livekitBinary);
    log('debug', 'URL:', LIVEKIT_URL);

    // Configuration LiveKit en arguments
    // En mode --dev, LiveKit utilise automatiquement devkey/secret
    const args = [
      '--dev',  // Mode développement (active debug + clés par défaut devkey/secret)
      '--bind', '0.0.0.0'
      // Note: --udp-port peut être ajouté si besoin (ex: --udp-port 7882)
      // Le port HTTP/WebSocket est 7880 par défaut
    ];

    livekitProcess = spawn(livekitBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LIVEKIT_LOG_LEVEL: 'info'  // Réduit les logs LiveKit (debug → info)
      },
      shell: true  // Permet de trouver le binaire dans PATH
    });

    livekitProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;

      // Filtrer les logs trop verbeux
      if (output.includes('DEBUG') ||
          output.includes('received signal request') ||
          output.includes('sending signal response') ||
          output.includes('handling signal request')) {
        return; // Ignorer ces logs
      }

      log('debug', '[LiveKit]', output);

      // Détection démarrage réussi
      if (output.includes('starting server') || output.includes('rtc server')) {
        resolve();
      }
    });

    livekitProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;

      // Filtrer les logs DEBUG de stderr aussi
      if (output.includes('DEBUG')) {
        return;
      }

      log('warn', '[LiveKit Error]', output);
    });

    livekitProcess.on('error', (error) => {
      log('error', 'Erreur LiveKit:', error);
      reject(error);
    });

    livekitProcess.on('exit', (code, signal) => {
      log('warn', `LiveKit Server arrêté (code: ${code}, signal: ${signal})`);
      livekitProcess = null;
    });

    // Timeout si pas de démarrage
    setTimeout(() => {
      if (livekitProcess) {
        resolve(); // On assume que c'est OK
      }
    }, 3000);
  });
}

// ========== API REST ==========

const app = express();
app.use(express.json());

// Middleware CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware redirection HTTP → HTTPS (si activé)
app.use((req, res, next) => {
  // Si HTTPS activé et requête en HTTP, rediriger
  if (ENABLE_HTTPS && req.protocol === 'http' && req.hostname !== 'localhost') {
    const httpsUrl = `https://${req.hostname}:${SERVER_PORT}${req.url}`;
    log('debug', `↪️  Redirection HTTPS: ${httpsUrl}`);
    return res.redirect(301, httpsUrl);
  }

  next();
});

// Middleware logging
app.use((req, res, next) => {
  log('debug', `${req.method} ${req.path}`);
  next();
});

// ========== Servir fichiers statiques client (production) ==========

// En production, servir le build client depuis ../client/dist
const clientDistPath = join(__dirname, '..', 'client', 'dist');

if (existsSync(clientDistPath)) {
  log('info', `📦 Serveur statique activé : ${clientDistPath}`);
  app.use(express.static(clientDistPath));
} else {
  log('debug', '📦 Pas de build client (mode dev)');
}

// ========== Routes Admin ==========

// Monter les routes admin sous /admin
app.use('/admin', adminRouter);

// ========== Routes API ==========

// Créer un router pour les routes API
const apiRouter = express.Router();

/**
 * GET /config
 * Retourne la configuration des groupes
 */
apiRouter.get('/config', (req, res) => {
  try {
    const clientConfig = {
      groups: config.groups.map(g => ({
        id: g.id,
        name: g.name
      })),
      audio: {
        sampleRate: config.audio.sampleRate,
        defaultBitrate: config.audio.defaultBitrate
      }
    };

    res.json(clientConfig);
  } catch (error) {
    log('error', 'Erreur GET /config:', error);
    res.status(500).json({ error: 'Configuration unavailable' });
  }
});

/**
 * GET /groups
 * Retourne la liste des groupes disponibles (simplifié)
 */
apiRouter.get('/groups', (req, res) => {
  try {
    const groups = config.groups.map(g => ({
      id: g.id,
      name: g.name
    }));

    res.json({ groups });
  } catch (error) {
    log('error', 'Erreur GET /groups:', error);
    res.status(500).json({ error: 'Groups unavailable' });
  }
});

/**
 * POST /token
 * Génère un token LiveKit pour un client
 * Body: { username: string, groupId: string }
 */
apiRouter.post('/token', async (req, res) => {
  try {
    const { username, groupId } = req.body;

    if (!username || !groupId) {
      return res.status(400).json({
        error: 'Missing username or groupId'
      });
    }

    // Vérifier que le groupe existe
    const group = config.groups.find(g => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        error: `Group ${groupId} not found`
      });
    }

    // Générer token LiveKit
    const roomName = groupId; // 1 room = 1 groupe
    const participantIdentity = `${username}-${Date.now()}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: username,
      metadata: JSON.stringify({ groupId })
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();

    log('info', `Token généré: ${username} → ${groupId}`);

    // Enregistrer l'utilisateur dans le système admin
    registerUser(participantIdentity, username, groupId, roomName);

    // Générer les canaux virtuels depuis le routing (inputs uniquement)
    const virtualChannels = [];
    const inputToGroup = config.audio?.routing?.inputToGroup || {};
    const channelNames = config.audio?.channelNames?.inputs || {};

    // Trouver tous les canaux physiques routés vers ce groupe
    for (const [inputChannel, groups] of Object.entries(inputToGroup)) {
      if (groups.includes(groupId)) {
        const channelName = channelNames[inputChannel] || `Canal ${inputChannel}`;
        virtualChannels.push({
          id: `input-${inputChannel}`,
          name: channelName,
          isVirtual: true,
          audioInput: parseInt(inputChannel, 10)
        });
      }
    }

    res.json({
      token,
      url: LIVEKIT_URL,
      roomName,
      participantIdentity,
      virtualChannels
    });

  } catch (error) {
    log('error', 'Erreur POST /token:', error);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

/**
 * GET /health
 * Health check
 */
apiRouter.get('/health', (req, res) => {
  const isLivekitRunning = livekitProcess !== null;
  res.json({
    status: isLivekitRunning ? 'ok' : 'degraded',
    livekit: isLivekitRunning,
    timestamp: new Date().toISOString()
  });
});

// Créer proxy WebSocket natif pour LiveKit (wss → ws)
const livekitProxy = httpProxy.createProxyServer({
  target: 'http://localhost:7880',
  ws: true,
  changeOrigin: true
});

livekitProxy.on('error', (err, req, res) => {
  log('error', `❌ Erreur proxy LiveKit: ${err.message}`);
  if (res && res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
  }
});

livekitProxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
  log('debug', `🔀 Proxy WebSocket: ${req.url} → ws://localhost:7880`);
});

// Proxy HTTP pour LiveKit (requêtes REST comme /rtc/validate)
app.use('/livekit', (req, res) => {
  log('debug', `🔀 Proxy HTTP: ${req.originalUrl} → http://localhost:7880${req.url}`);
  livekitProxy.web(req, res, {
    target: 'http://localhost:7880'
  });
});

// Monter le router API sous /api ET à la racine (rétrocompatibilité)
app.use('/api', apiRouter);
app.use(apiRouter); // Routes accessibles aussi sans préfixe /api

/**
 * GET /
 * Info serveur OU client PWA (si build existe)
 */
app.get('/', (req, res) => {
  // Si build client existe, servir index.html
  const indexPath = join(clientDistPath, 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Sinon, afficher info API
    res.json({
      name: 'PTT Live Server',
      version: '0.2.0',
      mode: 'development',
      endpoints: [
        'GET  /config - Configuration groupes',
        'GET  /groups - Liste des groupes',
        'POST /token  - Générer token client',
        'GET  /health - Health check',
        'GET  /admin - Interface administration'
      ]
    });
  }
});

// ========== Démarrage ==========

async function start() {
  try {
    log('info', '=== PTT Live Server ===');
    log('info', 'Phase 1 - MVP');
    log('info', '');

    // Affichage configuration réseau
    const networkIP = getNetworkIP();
    if (networkIP) {
      log('info', `📡 IP réseau détectée : ${networkIP}`);
    }
    log('info', `🔗 URL LiveKit clients : ${LIVEKIT_URL}`);
    log('info', '');

    // 1. Démarrer LiveKit (si mode local)
    if (USE_LOCAL_LIVEKIT) {
      await startLiveKitServer();
      log('info', '✓ LiveKit Server local démarré sur port 7880');
    } else {
      log('info', '✓ Mode LiveKit Cloud (LIVEKIT_URL:', LIVEKIT_URL, ')');
      log('warn', '⚠️  Pour utiliser LiveKit local, définir USE_LOCAL_LIVEKIT=true dans .env');
    }

    // 2. Démarrer API REST (HTTP ou HTTPS selon config)
    let server;

    if (ENABLE_HTTPS) {
      // Charger certificats SSL depuis .env ou fallback
      const certPath = process.env.SSL_CERT || join(__dirname, '..', 'certs', 'localhost.pem');
      const keyPath = process.env.SSL_KEY || join(__dirname, '..', 'certs', 'localhost-key.pem');

      if (!existsSync(certPath) || !existsSync(keyPath)) {
        log('error', '❌ Certificats SSL introuvables');
        log('info', '💡 Exécutez : ./setup-certificates.sh');
        process.exit(1);
      }

      const httpsOptions = {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath)
      };

      server = https.createServer(httpsOptions, app);
      server.listen(SERVER_PORT, SERVER_HOST, () => {
        log('info', `✓ API REST démarrée sur https://${SERVER_HOST}:${SERVER_PORT}`);
        log('info', '');
        log('info', 'Serveur prêt !');
        log('info', `Groupes configurés: ${config.groups.map(g => g.name).join(', ')}`);
        log('info', '');

        // Afficher URLs d'accès
        if (networkIP && networkIP !== 'localhost') {
          const prodUrl = `https://${networkIP}:${SERVER_PORT}`;
          log('info', '📱 Accès réseau WiFi :');
          log('info', '');
          log('info', `   Prod : ${prodUrl}`);
          log('info', '');
        }
      });
    } else {
      server = http.createServer(app);
      server.listen(SERVER_PORT, SERVER_HOST, () => {
        log('info', `✓ API REST démarrée sur http://${SERVER_HOST}:${SERVER_PORT}`);
        log('info', '');
        log('info', 'Serveur prêt !');
        log('info', `Groupes configurés: ${config.groups.map(g => g.name).join(', ')}`);
        log('info', '');

        // Afficher URLs d'accès
        if (networkIP && networkIP !== 'localhost') {
          const clientUrl = `https://${networkIP}:5173`; // Dev mode
          const prodUrl = `http://${networkIP}:${SERVER_PORT}`; // Prod mode HTTP

          log('info', '📱 Accès réseau WiFi :');
          log('info', '');
          log('info', `   Dev  : ${clientUrl}`);
          log('info', `   Prod : ${prodUrl}`);
          log('info', '');
        }
      });
    }

    // 2.5 Activer upgrade WebSocket pour proxy LiveKit
    // Important : gérer AVANT AudioLevelsServer
    server.on('upgrade', (req, socket, head) => {
      log('info', `📡 WebSocket upgrade: ${req.url}`);

      if (req.url.startsWith('/livekit')) {
        log('info', '🔀 Proxying to LiveKit on ws://localhost:7880');
        // Réécrire l'URL pour enlever /livekit
        req.url = req.url.replace(/^\/livekit/, '');
        livekitProxy.ws(req, socket, head);
      } else if (req.url.startsWith('/audio-levels')) {
        log('debug', '📊 Audio levels WebSocket - handled by AudioLevelsServer');
        // AudioLevelsServer will handle this
      } else {
        log('warn', `⚠️  Unknown WebSocket path: ${req.url}`);
        socket.destroy();
      }
    });

    // 2.6 Démarrer WebSocket Audio Levels (même port que l'API)
    const audioLevelsServer = new AudioLevelsServer({ server });
    audioLevelsServer.start();
    const wsProtocol = ENABLE_HTTPS ? 'wss' : 'ws';
    log('info', `✓ WebSocket Audio Levels démarré sur ${wsProtocol}://${SERVER_HOST}:${SERVER_PORT}`);

    // 3. Démarrer Audio Bridge Manager (Phase 2.5)
    log('info', '');
    log('info', '🎵 Démarrage Audio Bridge Manager...');
    await audioBridgeManager.start({ liveKitUrl: LIVEKIT_URL });
    log('info', '✓ Audio Bridge Manager prêt (mode placeholder)');

    // Gérer erreur port déjà utilisé
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        log('error', `❌ Port ${SERVER_PORT} déjà utilisé`);
        log('info', `💡 Essayez avec: PORT=3001 npm run dev`);
        process.exit(1);
      } else {
        throw error;
      }
    });

  } catch (error) {
    log('error', 'Erreur démarrage:', error);
    process.exit(1);
  }
}

// ========== Cleanup ==========

async function cleanup() {
  log('info', 'Arrêt du serveur...');

  // Arrêter l'audio bridge
  if (audioBridgeManager) {
    log('info', 'Arrêt Audio Bridge Manager...');
    await audioBridgeManager.stop();
  }

  if (livekitProcess) {
    log('info', 'Arrêt LiveKit Server...');
    livekitProcess.kill('SIGTERM');
  }

  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// ========== Lancement ==========

start();
