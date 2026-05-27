/**
 * API Admin - Gestion groupes, utilisateurs, monitoring
 * Phase 2.3
 */

import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CoreAudioBackend } from '../bridge/backends/CoreAudioBackend.js';
import configManager from '../config/ConfigManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

/**
 * Génère un ID slug à partir d'un nom
 */
function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

// État en mémoire des utilisateurs connectés
const connectedUsers = new Map(); // identity -> { username, groupId, roomName, connectedAt, lastActivity }

// Stats monitoring
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  audioStats: [],
  logs: []
};

// Configuration file path
const configPath = join(__dirname, '..', 'config', 'config.yaml');

/**
 * Charge la configuration depuis le fichier YAML
 * et génère les IDs à partir des noms
 */
function loadConfig() {
  const configFile = readFileSync(configPath, 'utf8');
  const config = YAML.parse(configFile);

  // Générer les IDs pour les groupes
  config.groups = config.groups.map(group => {
    const groupId = slugify(group.name);
    return {
      ...group,
      id: groupId
    };
  });

  return config;
}

/**
 * Sauvegarde la configuration dans le fichier YAML
 * Ne sauvegarde PAS les IDs (ils sont générés dynamiquement)
 */
function saveConfig(config) {
  // Nettoyer les IDs avant de sauvegarder
  const cleanConfig = {
    ...config,
    groups: config.groups.map(group => {
      const { id, ...groupWithoutId } = group;
      return groupWithoutId;
    })
  };

  const yamlContent = YAML.stringify(cleanConfig);
  writeFileSync(configPath, yamlContent, 'utf8');
}

/**
 * Ajoute un log au système
 */
export function addLog(level, message, meta = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta
  };

  stats.logs.unshift(log);

  // Garder max 1000 logs en mémoire
  if (stats.logs.length > 1000) {
    stats.logs = stats.logs.slice(0, 1000);
  }
}

/**
 * Enregistre une connexion utilisateur
 */
export function registerUser(identity, username, groupId, roomName) {
  connectedUsers.set(identity, {
    username,
    groupId,
    roomName,
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  });

  stats.totalConnections++;
  stats.activeConnections = connectedUsers.size;

  addLog('info', `User connected: ${username}`, { groupId, identity });
}

/**
 * Déconnecte un utilisateur
 */
export function unregisterUser(identity) {
  const user = connectedUsers.get(identity);
  if (user) {
    connectedUsers.delete(identity);
    stats.activeConnections = connectedUsers.size;
    addLog('info', `User disconnected: ${user.username}`, { groupId: user.groupId, identity });
  }
}

/**
 * Met à jour l'activité d'un utilisateur
 */
export function updateUserActivity(identity) {
  const user = connectedUsers.get(identity);
  if (user) {
    user.lastActivity = new Date().toISOString();
  }
}

/**
 * Ajoute des statistiques audio
 */
export function addAudioStats(data) {
  const stat = {
    timestamp: new Date().toISOString(),
    ...data
  };

  stats.audioStats.unshift(stat);

  // Garder max 100 stats
  if (stats.audioStats.length > 100) {
    stats.audioStats = stats.audioStats.slice(0, 100);
  }
}

// ========== Routes Admin ==========

/**
 * GET /admin/groups
 * Liste tous les groupes avec détails
 */
router.get('/groups', (req, res) => {
  try {
    const config = loadConfig();
    res.json({
      groups: config.groups
    });
  } catch (error) {
    console.error('Erreur GET /admin/groups:', error);
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

/**
 * POST /admin/groups
 * Crée un nouveau groupe
 * Body: { name, audioBitrate? }
 * L'ID est généré automatiquement à partir du nom
 */
router.post('/groups', (req, res) => {
  try {
    const { name, audioBitrate } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Missing required field: name'
      });
    }

    const config = loadConfig();

    // Générer l'ID à partir du nom
    const id = slugify(name);

    // Vérifier que l'ID n'existe pas déjà
    if (config.groups.find(g => g.id === id)) {
      return res.status(409).json({
        error: `Group "${name}" already exists (ID: ${id})`
      });
    }

    // Créer le nouveau groupe
    const newGroup = {
      name,
      ...(audioBitrate && { audioBitrate })
    };

    config.groups.push(newGroup);
    saveConfig(config);

    addLog('info', `Group created: ${name}`, { id });

    res.status(201).json({
      message: 'Group created',
      group: { ...newGroup, id }
    });

  } catch (error) {
    console.error('Erreur POST /admin/groups:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

/**
 * PUT /admin/groups/:id
 * Modifie un groupe existant
 * Body: { name?, audioBitrate? }
 * Note: l'ID est un slug généré, on cherche le groupe par nom dans le YAML
 */
router.put('/groups/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, audioBitrate } = req.body;

    const config = loadConfig();

    // Chercher le groupe par son nom (qui correspond à l'ID slugifié)
    const groupIndex = config.groups.findIndex(g => slugify(g.name) === id);

    if (groupIndex === -1) {
      return res.status(404).json({
        error: `Group ${id} not found`
      });
    }

    // Mettre à jour les champs fournis
    if (name !== undefined) config.groups[groupIndex].name = name;
    if (audioBitrate !== undefined) config.groups[groupIndex].audioBitrate = audioBitrate;

    saveConfig(config);

    addLog('info', `Group updated: ${config.groups[groupIndex].name}`, { id });

    // Recharger pour obtenir les IDs générés
    const updatedConfig = loadConfig();
    const updatedGroupIndex = updatedConfig.groups.findIndex(g => slugify(g.name) === id || slugify(g.name) === slugify(name));
    const updatedGroup = updatedGroupIndex !== -1 ? updatedConfig.groups[updatedGroupIndex] : null;

    res.json({
      message: 'Group updated',
      group: updatedGroup
    });

  } catch (error) {
    console.error('Erreur PUT /admin/groups:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

/**
 * DELETE /admin/groups/:id
 * Supprime un groupe
 * Note: l'ID est un slug généré, on cherche le groupe par nom dans le YAML
 */
router.delete('/groups/:id', (req, res) => {
  try {
    const { id } = req.params;

    const config = loadConfig();
    const groupIndex = config.groups.findIndex(g => slugify(g.name) === id);

    if (groupIndex === -1) {
      return res.status(404).json({
        error: `Group ${id} not found`
      });
    }

    const groupName = config.groups[groupIndex].name;
    config.groups.splice(groupIndex, 1);
    saveConfig(config);

    addLog('info', `Group deleted: ${groupName}`, { id });

    res.json({
      message: 'Group deleted',
      id
    });

  } catch (error) {
    console.error('Erreur DELETE /admin/groups:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

/**
 * GET /admin/users
 * Liste tous les utilisateurs connectés
 */
router.get('/users', (req, res) => {
  try {
    const users = Array.from(connectedUsers.entries()).map(([identity, data]) => ({
      identity,
      ...data
    }));

    res.json({
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Erreur GET /admin/users:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * DELETE /admin/users/:identity
 * Déconnecte un utilisateur (force disconnect)
 */
router.delete('/users/:identity', (req, res) => {
  try {
    const { identity } = req.params;

    const user = connectedUsers.get(identity);
    if (!user) {
      return res.status(404).json({
        error: `User ${identity} not found`
      });
    }

    unregisterUser(identity);
    addLog('warn', `User force disconnected: ${user.username}`, { identity });

    res.json({
      message: 'User disconnected',
      identity
    });

  } catch (error) {
    console.error('Erreur DELETE /admin/users:', error);
    res.status(500).json({ error: 'Failed to disconnect user' });
  }
});

/**
 * GET /admin/stats
 * Statistiques temps réel
 */
router.get('/stats', (req, res) => {
  try {
    res.json({
      totalConnections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      audioStats: stats.audioStats.slice(0, 20), // 20 dernières stats
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    console.error('Erreur GET /admin/stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/**
 * GET /admin/logs
 * Logs serveur
 * Query params: ?limit=100&level=info
 */
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;

    let logs = stats.logs;

    // Filtrer par niveau si spécifié
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    // Limiter le nombre
    logs = logs.slice(0, limit);

    res.json({
      logs,
      total: stats.logs.length
    });
  } catch (error) {
    console.error('Erreur GET /admin/logs:', error);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

/**
 * GET /admin/config
 * Configuration serveur complète
 */
router.get('/config', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (error) {
    console.error('Erreur GET /admin/config:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

/**
 * PUT /admin/config/audio
 * Met à jour la configuration audio globale
 * Body: { sampleRate?, defaultBitrate?, jitterBufferMs? }
 */
router.put('/config/audio', (req, res) => {
  try {
    const { sampleRate, defaultBitrate, jitterBufferMs } = req.body;

    const config = loadConfig();

    if (sampleRate !== undefined) config.audio.sampleRate = sampleRate;
    if (defaultBitrate !== undefined) config.audio.defaultBitrate = defaultBitrate;
    if (jitterBufferMs !== undefined) config.audio.jitterBufferMs = jitterBufferMs;

    saveConfig(config);

    addLog('info', 'Audio config updated', { sampleRate, defaultBitrate, jitterBufferMs });

    res.json({
      message: 'Audio config updated',
      audio: config.audio
    });

  } catch (error) {
    console.error('Erreur PUT /admin/config/audio:', error);
    res.status(500).json({ error: 'Failed to update audio config' });
  }
});

// ========== Routes Audio Devices (Phase 2.5) ==========

/**
 * GET /admin/audio/devices
 * Énumération de toutes les cartes son disponibles
 */
router.get('/audio/devices', (req, res) => {
  try {
    const devices = CoreAudioBackend.getDevices();
    const defaultInput = CoreAudioBackend.getDefaultInputDevice();
    const defaultOutput = CoreAudioBackend.getDefaultOutputDevice();

    res.json({
      devices,
      defaultInput,
      defaultOutput
    });
  } catch (error) {
    console.error('Erreur GET /admin/audio/devices:', error);
    res.status(500).json({ error: 'Failed to enumerate audio devices' });
  }
});

/**
 * GET /admin/audio/device
 * Récupère la configuration actuelle de la carte son sélectionnée
 */
router.get('/audio/device', (req, res) => {
  try {
    const config = configManager.get();
    const audioDevice = config.audio?.device || {};

    // Enrichir avec les infos réelles de la carte si configurée
    const devices = CoreAudioBackend.getDevices();
    let deviceInfo = { ...audioDevice };

    if (audioDevice.inputDeviceId) {
      const inputDev = devices.find(d => d.id === audioDevice.inputDeviceId);
      if (inputDev) {
        deviceInfo.inputChannels = inputDev.maxInputChannels;
        deviceInfo.inputDeviceName = inputDev.name;
      }
    }

    if (audioDevice.outputDeviceId) {
      const outputDev = devices.find(d => d.id === audioDevice.outputDeviceId);
      if (outputDev) {
        deviceInfo.outputChannels = outputDev.maxOutputChannels;
        deviceInfo.outputDeviceName = outputDev.name;
      }
    }

    res.json({
      device: deviceInfo
    });
  } catch (error) {
    console.error('Erreur GET /admin/audio/device:', error);
    res.status(500).json({ error: 'Failed to load audio device config' });
  }
});

/**
 * GET /admin/audio/channels/names
 * Récupère les noms personnalisés des canaux physiques
 */
router.get('/audio/channels/names', (req, res) => {
  try {
    const config = configManager.get();
    const channelNames = config.audio?.channelNames || { inputs: {}, outputs: {} };

    res.json({
      channelNames
    });
  } catch (error) {
    console.error('Erreur GET /admin/audio/channels/names:', error);
    res.status(500).json({ error: 'Failed to load channel names' });
  }
});

/**
 * PUT /admin/audio/channels/names
 * Sauvegarde les noms personnalisés des canaux physiques
 * Body: { inputs: { "0": "Micro Principal", ... }, outputs: { "0": "Retour Scène", ... } }
 */
router.put('/audio/channels/names', (req, res) => {
  try {
    const { inputs, outputs } = req.body;

    if (!inputs && !outputs) {
      return res.status(400).json({
        error: 'Missing required fields: inputs or outputs'
      });
    }

    const config = configManager.get();

    if (!config.audio.channelNames) {
      config.audio.channelNames = { inputs: {}, outputs: {} };
    }

    if (inputs) {
      config.audio.channelNames.inputs = inputs;
    }

    if (outputs) {
      config.audio.channelNames.outputs = outputs;
    }

    configManager.save(config);

    addLog('info', 'Channel names updated', { inputCount: Object.keys(inputs || {}).length, outputCount: Object.keys(outputs || {}).length });

    res.json({
      message: 'Channel names updated',
      channelNames: config.audio.channelNames
    });

  } catch (error) {
    console.error('Erreur PUT /admin/audio/channels/names:', error);
    res.status(500).json({ error: 'Failed to update channel names' });
  }
});

/**
 * GET /admin/audio/routing
 * Récupère la configuration de routing actuelle
 * Format: { inputToGroup: { "0": ["production"], "1": ["technique"] }, groupToOutput: { "production": ["0", "1"] } }
 */
router.get('/audio/routing', (req, res) => {
  try {
    const config = configManager.get();
    const routing = config.audio?.routing || { inputToGroup: {}, groupToOutput: {}, gains: {} };

    res.json({
      routing
    });
  } catch (error) {
    console.error('Erreur GET /admin/audio/routing:', error);
    res.status(500).json({ error: 'Failed to load routing' });
  }
});

/**
 * POST /audio/routing
 * Sauvegarde la configuration de routing
 * Body: { inputToGroup: {...}, groupToOutput: {...}, gains: {...} }
 */
router.post('/audio/routing', (req, res) => {
  try {
    const { inputToGroup, groupToOutput, gains } = req.body;

    const config = configManager.get();

    if (!config.audio.routing) {
      config.audio.routing = { inputToGroup: {}, groupToOutput: {}, gains: {} };
    }

    if (inputToGroup !== undefined) {
      config.audio.routing.inputToGroup = inputToGroup;
    }

    if (groupToOutput !== undefined) {
      config.audio.routing.groupToOutput = groupToOutput;
    }

    if (gains !== undefined) {
      config.audio.routing.gains = gains;
    }

    configManager.save(config);

    addLog('info', 'Audio routing updated');

    res.json({
      message: 'Audio routing updated',
      routing: config.audio.routing
    });

  } catch (error) {
    console.error('Erreur POST /admin/audio/routing:', error);
    res.status(500).json({ error: 'Failed to update routing' });
  }
});

/**
 * POST /admin/audio/device
 * Sélectionne et configure une carte son
 * Body: { inputDeviceId?, outputDeviceId?, sampleRate?, bufferSize? }
 */
router.post('/audio/device', (req, res) => {
  try {
    const { inputDeviceId, outputDeviceId, sampleRate, bufferSize } = req.body;

    // Utiliser le ConfigManager pour mettre à jour et émettre l'événement
    const deviceConfig = configManager.updateAudioDevice({
      inputDeviceId,
      outputDeviceId,
      sampleRate,
      bufferSize
    });

    addLog('info', 'Audio device configured', { inputDeviceId, outputDeviceId, sampleRate, bufferSize });

    res.json({
      message: 'Audio device configured (bridge audio sera rechargé)',
      device: deviceConfig
    });

  } catch (error) {
    console.error('Erreur POST /admin/audio/device:', error);
    res.status(500).json({ error: 'Failed to configure audio device' });
  }
});

/**
 * GET /admin/devices/list
 * Liste tous les devices audio disponibles (auto-détection)
 * Supporte macOS (CoreAudio), Linux (JACK/PipeWire), Windows (WASAPI)
 */
router.get('/devices/list', async (req, res) => {
  try {
    const devices = {
      inputs: [],
      outputs: [],
      platform: process.platform
    };

    // Détection selon la plateforme
    if (process.platform === 'darwin') {
      // macOS : utiliser CoreAudio via sox
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);

      try {
        // Utiliser sox pour lister les devices audio
        const { stdout } = await execPromise('sox -V6 2>&1');

        // Parser la sortie sox pour extraire les devices
        // Format typique : "Input Device [0]: MacBook Pro Microphone"
        const inputMatches = stdout.matchAll(/Input Device \[(\d+)\]: (.+)/g);
        const outputMatches = stdout.matchAll(/Output Device \[(\d+)\]: (.+)/g);

        for (const match of inputMatches) {
          devices.inputs.push({
            id: parseInt(match[1], 10),
            name: match[2].trim()
          });
        }

        for (const match of outputMatches) {
          devices.outputs.push({
            id: parseInt(match[1], 10),
            name: match[2].trim()
          });
        }
      } catch (soxError) {
        console.warn('⚠️  sox non disponible, devices limités:', soxError.message);

        // Fallback : devices par défaut macOS
        devices.inputs.push({ id: 0, name: 'Default Input (Built-in Microphone)', isDefault: true });
        devices.outputs.push({ id: 0, name: 'Default Output (Built-in Speakers)', isDefault: true });
      }

    } else if (process.platform === 'linux') {
      // Linux : JACK ou PipeWire
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);

      try {
        // Essayer JACK d'abord
        const { stdout: jackPorts } = await execPromise('jack_lsp 2>/dev/null || echo ""');

        if (jackPorts.trim()) {
          // Parser les ports JACK
          const ports = jackPorts.split('\n').filter(Boolean);

          ports.forEach(port => {
            if (port.includes('capture')) {
              devices.inputs.push({ id: port, name: port });
            } else if (port.includes('playback')) {
              devices.outputs.push({ id: port, name: port });
            }
          });
        } else {
          // Fallback : PipeWire via pactl
          const { stdout: paDevices } = await execPromise('pactl list short sources 2>/dev/null || echo ""');
          const { stdout: paSinks } = await execPromise('pactl list short sinks 2>/dev/null || echo ""');

          if (paDevices.trim()) {
            paDevices.split('\n').filter(Boolean).forEach((line, idx) => {
              const name = line.split('\t')[1] || `Device ${idx}`;
              devices.inputs.push({ id: idx, name });
            });
          }

          if (paSinks.trim()) {
            paSinks.split('\n').filter(Boolean).forEach((line, idx) => {
              const name = line.split('\t')[1] || `Device ${idx}`;
              devices.outputs.push({ id: idx, name });
            });
          }
        }
      } catch (linuxError) {
        console.warn('⚠️  Détection devices Linux échouée:', linuxError.message);
        devices.inputs.push({ id: 0, name: 'Default Input', isDefault: true });
        devices.outputs.push({ id: 0, name: 'Default Output', isDefault: true });
      }

    } else if (process.platform === 'win32') {
      // Windows : WASAPI (Phase 3)
      // TODO: implémenter détection WASAPI
      devices.inputs.push({ id: 0, name: 'Default Input (Windows)', isDefault: true });
      devices.outputs.push({ id: 0, name: 'Default Output (Windows)', isDefault: true });
    }

    addLog('info', 'Audio devices listed', {
      inputsCount: devices.inputs.length,
      outputsCount: devices.outputs.length
    });

    res.json(devices);

  } catch (error) {
    console.error('Erreur GET /admin/devices/list:', error);
    res.status(500).json({
      error: 'Failed to list audio devices',
      message: error.message,
      platform: process.platform
    });
  }
});

export default router;
