/**
 * AudioLevelsServer.js
 * WebSocket server pour streaming des niveaux audio temps réel
 *
 * Permet à l'interface admin de visualiser :
 * - Niveaux d'entrée physiques (VU-mètres)
 * - Niveaux de groupes LiveKit
 * - Niveaux de sortie physiques
 * - Détection de clipping
 * - État des routes actives
 */

import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';

/**
 * Calcule le niveau RMS d'un buffer audio (dBFS)
 */
function calculateRMS(buffer) {
  if (!buffer || buffer.length === 0) return -120; // Silence

  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }

  const rms = Math.sqrt(sum / buffer.length);

  // Conversion en dBFS (0dBFS = niveau max)
  if (rms === 0) return -120;
  const dbFS = 20 * Math.log10(rms);

  return Math.max(-120, Math.min(0, dbFS));
}

/**
 * Calcule le peak d'un buffer audio
 */
function calculatePeak(buffer) {
  if (!buffer || buffer.length === 0) return 0;

  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    peak = Math.max(peak, Math.abs(buffer[i]));
  }

  return peak;
}

/**
 * Serveur WebSocket pour monitoring audio
 */
export class AudioLevelsServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      port: options.port || 3001,
      server: options.server || null,
      updateRateMs: options.updateRateMs || 50,
      channelNames: options.channelNames || { inputs: {}, outputs: {} },
      ...options
    };

    this.wss = null;
    this.clients = new Set();
    this.updateInterval = null;

    // Données à broadcaster
    this.levels = {
      inputs: {}, // { channelId: { rms: -12, peak: 0.5, clipping: false } }
      groups: {}, // { groupName: { rms: -8, peak: 0.7, clipping: false } }
      outputs: {}, // { channelId: { rms: -10, peak: 0.6, clipping: false } }
      routing: {
        activeInputs: [],
        activeGroups: [],
        activeOutputs: []
      }
    };

    this.stats = {
      connectedClients: 0,
      messagesSent: 0,
      errors: 0
    };

    // Accumulateur MAX par fenêtre de broadcast (50ms)
    // Évite les a-coups quand entrée physique et réception LiveKit écrivent en alternance
    this._pendingGroups = {};
  }

  /**
   * Démarre le serveur WebSocket
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        // Si un serveur HTTP est fourni, utiliser le même port (upgrade HTTP → WebSocket)
        // noServer: true car l'upgrade est dispatché manuellement par server/index.js
        // (un seul listener 'upgrade' partagé avec le proxy LiveKit, voir handleUpgrade())
        // Sinon, créer un serveur WebSocket standalone sur son propre port
        const wsOptions = this.options.server
          ? { noServer: true }
          : { port: this.options.port };

        this.wss = new WebSocketServer(wsOptions);

        this.wss.on('connection', (ws, req) => {
          this._handleNewConnection(ws, req);
        });

        this.wss.on('error', (error) => {
          console.error('Erreur WebSocket server:', error);
          this.stats.errors++;
          this.emit('error', error);
        });

        // Démarrage du broadcast périodique
        this._startBroadcast();

        if (this.options.server) {
          console.log(`WebSocket AudioLevels démarré sur path /audio-levels (même port que HTTP)`);
        } else {
          console.log(`WebSocket AudioLevels démarré sur ws://localhost:${this.options.port}`);
        }

        this.emit('started');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Complète l'upgrade WebSocket pour une requête déjà identifiée comme
   * ciblant ce serveur (voir le dispatcher 'upgrade' dans server/index.js)
   */
  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  /**
   * Gère une nouvelle connexion client
   */
  _handleNewConnection(ws, req) {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    console.log(`Nouveau client audio-levels: ${clientId}`);

    this.clients.add(ws);
    this.stats.connectedClients = this.clients.size;

    // Envoi des données actuelles immédiatement (avec noms des canaux)
    this._sendToClient(ws, {
      type: 'initial',
      data: this.levels,
      channelNames: this.options.channelNames
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        this._handleClientMessage(ws, data);
      } catch (error) {
        console.error('Erreur parsing message client:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Client déconnecté: ${clientId}`);
      this.clients.delete(ws);
      this.stats.connectedClients = this.clients.size;
    });

    ws.on('error', (error) => {
      console.error(`Erreur client ${clientId}:`, error);
      this.clients.delete(ws);
      this.stats.connectedClients = this.clients.size;
    });

    this.emit('clientConnected', { clientId, totalClients: this.clients.size });
  }

  /**
   * Gère les messages entrants des clients
   */
  _handleClientMessage(ws, message) {
    switch (message.type) {
      case 'ping':
        this._sendToClient(ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'setUpdateRate':
        // Permet au client de modifier le taux de rafraîchissement
        if (message.rateMs >= 20 && message.rateMs <= 1000) {
          this._restartBroadcast(message.rateMs);
        }
        break;

      default:
        console.warn('Message client inconnu:', message.type);
    }
  }

  /**
   * Démarre le broadcast périodique
   */
  _startBroadcast() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this._broadcastLevels();
    }, this.options.updateRateMs);
  }

  /**
   * Redémarre le broadcast avec un nouveau taux
   */
  _restartBroadcast(newRateMs) {
    this.options.updateRateMs = newRateMs;
    this._startBroadcast();
    console.log(`Taux de rafraîchissement modifié: ${newRateMs}ms`);
  }

  /**
   * Broadcast les niveaux à tous les clients connectés
   */
  _broadcastLevels() {
    if (this.clients.size === 0) return;

    // Appliquer les niveaux de groupe accumulés (MAX de la fenêtre) et réinitialiser
    this.levels.groups = { ...this._pendingGroups };
    this.levels.routing.activeGroups = Object.keys(this._pendingGroups);
    this._pendingGroups = {};

    const message = {
      type: 'levels',
      timestamp: Date.now(),
      data: this.levels
    };

    this._broadcast(message);
  }

  /**
   * Envoie un message à tous les clients
   */
  _broadcast(message) {
    const payload = JSON.stringify(message);

    this.clients.forEach(ws => {
      if (ws.readyState === 1) { // OPEN
        try {
          ws.send(payload);
          this.stats.messagesSent++;
        } catch (error) {
          console.error('Erreur envoi message:', error);
          this.stats.errors++;
        }
      }
    });
  }

  /**
   * Envoie un message à un client spécifique
   */
  _sendToClient(ws, message) {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
      } catch (error) {
        console.error('Erreur envoi message client:', error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Met à jour les niveaux d'entrée
   * Appelé par le GroupAudioRouter après processInputsToGroups()
   */
  updateInputLevels(inputBuffers) {
    inputBuffers.forEach((buffer, channelId) => {
      const rms = calculateRMS(buffer);
      const peak = calculatePeak(buffer);
      const clipping = peak >= 0.99;

      this.levels.inputs[channelId] = { rms, peak, clipping };
    });

    this.levels.routing.activeInputs = Array.from(inputBuffers.keys());
  }

  /**
   * Met à jour les niveaux de groupe.
   * Accumule le MAX de la fenêtre de broadcast pour éviter les a-coups
   * quand entrée physique et réception LiveKit s'alternent sur le même groupe.
   */
  updateGroupLevels(groupBuffers) {
    groupBuffers.forEach((buffer, groupName) => {
      const rms = calculateRMS(buffer);
      const peak = calculatePeak(buffer);
      const clipping = peak >= 0.99;

      const existing = this._pendingGroups[groupName];
      if (!existing || rms > existing.rms) {
        this._pendingGroups[groupName] = { rms, peak, clipping };
      }
    });
  }

  /**
   * Met à jour les niveaux de sortie
   * Appelé par le GroupAudioRouter après processGroupsToOutputs()
   */
  updateOutputLevels(outputBuffers) {
    outputBuffers.forEach((buffer, channelId) => {
      const rms = calculateRMS(buffer);
      const peak = calculatePeak(buffer);
      const clipping = peak >= 0.99;

      this.levels.outputs[channelId] = { rms, peak, clipping };
    });

    this.levels.routing.activeOutputs = Array.from(outputBuffers.keys());
  }

  /**
   * Réinitialise tous les niveaux (silence)
   */
  resetLevels() {
    this.levels = {
      inputs: {},
      groups: {},
      outputs: {},
      routing: {
        activeInputs: [],
        activeGroups: [],
        activeOutputs: []
      }
    };
    this._pendingGroups = {};
  }

  /**
   * Récupère les statistiques
   */
  getStats() {
    return {
      ...this.stats,
      updateRateMs: this.options.updateRateMs,
      port: this.options.port
    };
  }

  /**
   * Arrête le serveur
   */
  async stop() {
    console.log('Arrêt AudioLevelsServer...');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.wss) {
      // Ferme toutes les connexions clients
      this.clients.forEach(ws => {
        ws.close(1000, 'Server shutdown');
      });

      this.clients.clear();

      // Ferme le serveur
      await new Promise((resolve) => {
        this.wss.close(() => {
          console.log('WebSocket AudioLevels arrêté');
          resolve();
        });
      });

      this.wss = null;
    }

    this.emit('stopped');
  }

  /**
   * Détruit le serveur
   */
  async destroy() {
    await this.stop();
    this.removeAllListeners();
    console.log('AudioLevelsServer détruit');
  }
}

export default AudioLevelsServer;
