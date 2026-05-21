#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import YAML from 'yaml';
import { AccessToken } from 'livekit-server-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Chargement configuration
const configPath = join(__dirname, 'config', 'config.yaml');
const configFile = readFileSync(configPath, 'utf8');
const config = YAML.parse(configFile);

// Variables d'environnement
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || config.server.livekit.url;
const USE_LOCAL_LIVEKIT = process.env.USE_LOCAL_LIVEKIT === 'true';
const SERVER_PORT = parseInt(process.env.PORT || config.server.port, 10);
const SERVER_HOST = config.server.host;

// Logging
const LOG_LEVEL = config.logging.level;

function log(level, ...args) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configLevel = levels[LOG_LEVEL] || 1;
  const msgLevel = levels[level] || 1;

  if (msgLevel >= configLevel) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

// ========== Démarrage LiveKit Server ==========

let livekitProcess = null;

function startLiveKitServer() {
  return new Promise((resolve, reject) => {
    const livekitBinary = join(__dirname, 'bin', 'livekit-server');

    log('info', 'Démarrage LiveKit Server...');
    log('debug', 'Binaire:', livekitBinary);
    log('debug', 'URL:', LIVEKIT_URL);

    // Configuration LiveKit en arguments
    const args = [
      '--dev',  // Mode développement
      '--bind', '0.0.0.0',
      '--port', '7880',
      '--rtc-port-range-start', '50000',
      '--rtc-port-range-end', '60000',
      '--keys', `${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}`
    ];

    livekitProcess = spawn(livekitBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    livekitProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        log('debug', '[LiveKit]', output);
      }

      // Détection démarrage réussi
      if (output.includes('starting server') || output.includes('rtc server')) {
        resolve();
      }
    });

    livekitProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        log('warn', '[LiveKit Error]', output);
      }
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

// Middleware logging
app.use((req, res, next) => {
  log('debug', `${req.method} ${req.path}`);
  next();
});

// ========== Routes API ==========

/**
 * GET /config
 * Retourne la configuration des groupes
 */
app.get('/config', (req, res) => {
  try {
    const clientConfig = {
      groups: config.groups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        channels: g.channels.map(c => ({
          id: c.id,
          name: c.name
        }))
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
 * POST /token
 * Génère un token LiveKit pour un client
 * Body: { username: string, groupId: string }
 */
app.post('/token', async (req, res) => {
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

    res.json({
      token,
      url: LIVEKIT_URL,
      roomName,
      participantIdentity
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
app.get('/health', (req, res) => {
  const isLivekitRunning = livekitProcess !== null;
  res.json({
    status: isLivekitRunning ? 'ok' : 'degraded',
    livekit: isLivekitRunning,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 * Info serveur
 */
app.get('/', (req, res) => {
  res.json({
    name: 'PTT Live Server',
    version: '0.1.0',
    phase: 'Phase 1 - MVP',
    endpoints: [
      'GET  /config - Configuration groupes',
      'POST /token  - Générer token client',
      'GET  /health - Health check'
    ]
  });
});

// ========== Démarrage ==========

async function start() {
  try {
    log('info', '=== PTT Live Server ===');
    log('info', 'Phase 1 - MVP');
    log('info', '');

    // 1. Démarrer LiveKit (si mode local)
    if (USE_LOCAL_LIVEKIT) {
      await startLiveKitServer();
      log('info', '✓ LiveKit Server local démarré sur port 7880');
    } else {
      log('info', '✓ Mode LiveKit Cloud (LIVEKIT_URL:', LIVEKIT_URL, ')');
      log('warn', '⚠️  Pour utiliser LiveKit local, définir USE_LOCAL_LIVEKIT=true dans .env');
    }

    // 2. Démarrer API REST
    const server = app.listen(SERVER_PORT, SERVER_HOST, () => {
      log('info', `✓ API REST démarrée sur http://${SERVER_HOST}:${SERVER_PORT}`);
      log('info', '');
      log('info', 'Serveur prêt !');
      log('info', `Groupes configurés: ${config.groups.map(g => g.name).join(', ')}`);
    });

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

function cleanup() {
  log('info', 'Arrêt du serveur...');

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
