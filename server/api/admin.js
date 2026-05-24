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

  // Générer les IDs pour les groupes et canaux
  config.groups = config.groups.map(group => {
    const groupId = slugify(group.name);
    return {
      ...group,
      id: groupId,
      channels: group.channels ? group.channels.map(channel => ({
        ...channel,
        id: channel.id || `${groupId}-${slugify(channel.name)}`
      })) : []
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
      return {
        ...groupWithoutId,
        channels: group.channels ? group.channels.map(channel => {
          const { id: channelId, ...channelWithoutId } = channel;
          return channelWithoutId;
        }) : []
      };
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
 * Body: { name, audioBitrate?, channels }
 * L'ID est généré automatiquement à partir du nom
 */
router.post('/groups', (req, res) => {
  try {
    const { name, audioBitrate, channels } = req.body;

    if (!name || !channels || !Array.isArray(channels)) {
      return res.status(400).json({
        error: 'Missing required fields: name, channels'
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

    // Générer les IDs pour les canaux
    const channelsWithIds = channels.map(channel => ({
      ...channel,
      id: channel.id || `${id}-${slugify(channel.name)}`
    }));

    // Créer le nouveau groupe
    const newGroup = {
      name,
      audioBitrate: audioBitrate || config.audio.defaultBitrate,
      channels: channelsWithIds
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
 * Body: { name?, audioBitrate?, channels? }
 * Note: l'ID est un slug généré, on cherche le groupe par nom dans le YAML
 */
router.put('/groups/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, audioBitrate, channels } = req.body;

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
    if (channels !== undefined) {
      // Pas besoin de générer les IDs ici, ils seront générés au chargement
      config.groups[groupIndex].channels = channels.map(channel => ({
        name: channel.name,
        audioInput: channel.audioInput,
        audioOutput: channel.audioOutput
      }));
    }

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

export default router;
