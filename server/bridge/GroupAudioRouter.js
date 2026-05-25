/**
 * GroupAudioRouter.js
 * Gestion du routing audio multi-canaux entre entrées physiques, groupes LiveKit et sorties physiques
 *
 * Architecture :
 * - Mix de plusieurs canaux physiques vers un groupe (avec gains individuels)
 * - Distribution d'un groupe vers plusieurs canaux physiques (avec gains individuels)
 * - Support canaux partagés (mixage additif)
 * - Gestion gains par route (-120dB à +6dB)
 */

import { EventEmitter } from 'events';

/**
 * Représente une route audio avec gain
 */
class AudioRoute {
  constructor(source, destination, gain = 0.0) {
    this.source = source; // Numéro de canal ou nom de groupe
    this.destination = destination; // Nom de groupe ou numéro de canal
    this.gain = gain; // Gain en dB (-120 à +6)
    this.linearGain = this._dbToLinear(gain);
  }

  /**
   * Met à jour le gain en dB
   */
  setGain(gainDb) {
    this.gain = Math.max(-120, Math.min(6, gainDb));
    this.linearGain = this._dbToLinear(this.gain);
  }

  /**
   * Convertit dB en gain linéaire
   */
  _dbToLinear(db) {
    if (db <= -120) return 0.0;
    return Math.pow(10, db / 20);
  }
}

/**
 * Router audio principal
 */
export class GroupAudioRouter extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      sampleRate: config.sampleRate || 48000,
      frameSize: config.frameSize || 960, // 20ms à 48kHz
      maxInputChannels: config.maxInputChannels || 32,
      maxOutputChannels: config.maxOutputChannels || 32,
      groups: config.groups || []
    };

    // Routes : input -> group
    this.inputToGroupRoutes = new Map(); // Map<string, AudioRoute[]>
    // Routes : group -> output
    this.groupToOutputRoutes = new Map(); // Map<string, AudioRoute[]>

    // Buffers audio
    this.inputBuffers = new Map(); // Map<number, Float32Array>
    this.groupBuffers = new Map(); // Map<string, Float32Array>
    this.outputBuffers = new Map(); // Map<number, Float32Array>

    // Statistiques
    this.stats = {
      framesProcessed: 0,
      clippingEvents: 0,
      routesActive: 0
    };
  }

  /**
   * Configure le routing depuis la config YAML
   */
  configure(routingConfig) {
    console.log('Configuration du routing audio...');

    // Réinitialise les routes
    this.inputToGroupRoutes.clear();
    this.groupToOutputRoutes.clear();

    // Configure input -> group
    if (routingConfig.inputToGroup) {
      Object.entries(routingConfig.inputToGroup).forEach(([channelId, groups]) => {
        const channel = parseInt(channelId);

        groups.forEach(groupName => {
          this.addInputToGroupRoute(channel, groupName, this._getGain(routingConfig.gains, `in_${channel}_${groupName}`));
        });
      });
    }

    // Configure group -> output
    if (routingConfig.groupToOutput) {
      Object.entries(routingConfig.groupToOutput).forEach(([groupName, channels]) => {
        channels.forEach(channelId => {
          const channel = parseInt(channelId);
          this.addGroupToOutputRoute(groupName, channel, this._getGain(routingConfig.gains, `${groupName}_out_${channel}`));
        });
      });
    }

    this._updateStatsActiveRoutes();
    console.log(`Routing configuré : ${this.stats.routesActive} routes actives`);
    this.emit('configured', this.stats);
  }

  /**
   * Récupère le gain depuis la config
   */
  _getGain(gainsConfig, routeKey) {
    return gainsConfig && gainsConfig[routeKey] ? gainsConfig[routeKey] : 0.0;
  }

  /**
   * Ajoute une route input -> group
   */
  addInputToGroupRoute(inputChannel, groupName, gainDb = 0.0) {
    const key = `in_${inputChannel}`;

    if (!this.inputToGroupRoutes.has(key)) {
      this.inputToGroupRoutes.set(key, []);
    }

    const route = new AudioRoute(inputChannel, groupName, gainDb);
    this.inputToGroupRoutes.get(key).push(route);

    console.log(`Route ajoutée : Input ${inputChannel} -> Group "${groupName}" (${gainDb}dB)`);
    this._updateStatsActiveRoutes();
  }

  /**
   * Ajoute une route group -> output
   */
  addGroupToOutputRoute(groupName, outputChannel, gainDb = 0.0) {
    const key = groupName;

    if (!this.groupToOutputRoutes.has(key)) {
      this.groupToOutputRoutes.set(key, []);
    }

    const route = new AudioRoute(groupName, outputChannel, gainDb);
    this.groupToOutputRoutes.get(key).push(route);

    console.log(`Route ajoutée : Group "${groupName}" -> Output ${outputChannel} (${gainDb}dB)`);
    this._updateStatsActiveRoutes();
  }

  /**
   * Supprime toutes les routes d'une entrée
   */
  removeInputRoutes(inputChannel) {
    this.inputToGroupRoutes.delete(`in_${inputChannel}`);
    this._updateStatsActiveRoutes();
  }

  /**
   * Supprime toutes les routes d'un groupe vers les sorties
   */
  removeGroupOutputRoutes(groupName) {
    this.groupToOutputRoutes.delete(groupName);
    this._updateStatsActiveRoutes();
  }

  /**
   * Met à jour le gain d'une route spécifique
   */
  setRouteGain(source, destination, gainDb) {
    // Cherche dans input -> group
    const inputKey = typeof source === 'number' ? `in_${source}` : null;
    if (inputKey && this.inputToGroupRoutes.has(inputKey)) {
      const routes = this.inputToGroupRoutes.get(inputKey);
      const route = routes.find(r => r.destination === destination);
      if (route) {
        route.setGain(gainDb);
        console.log(`Gain modifié : Input ${source} -> Group "${destination}" = ${gainDb}dB`);
        return true;
      }
    }

    // Cherche dans group -> output
    if (typeof source === 'string' && this.groupToOutputRoutes.has(source)) {
      const routes = this.groupToOutputRoutes.get(source);
      const route = routes.find(r => r.destination === destination);
      if (route) {
        route.setGain(gainDb);
        console.log(`Gain modifié : Group "${source}" -> Output ${destination} = ${gainDb}dB`);
        return true;
      }
    }

    return false;
  }

  /**
   * ÉTAPE 1 : Traite les entrées audio physiques vers les buffers de groupe
   * Mixe plusieurs canaux d'entrée vers chaque groupe (avec gains individuels)
   *
   * @param {Map<number, Float32Array>} inputChannelsData - Données PCM par canal d'entrée
   */
  processInputsToGroups(inputChannelsData) {
    // Réinitialise les buffers de groupe
    this.groupBuffers.clear();
    this.config.groups.forEach(group => {
      this.groupBuffers.set(group.name, new Float32Array(this.config.frameSize));
    });

    // Pour chaque canal d'entrée
    inputChannelsData.forEach((pcmData, channelId) => {
      const key = `in_${channelId}`;
      const routes = this.inputToGroupRoutes.get(key);

      if (!routes || routes.length === 0) return;

      // Stocke le buffer d'entrée
      this.inputBuffers.set(channelId, pcmData);

      // Applique chaque route (mixage additif vers les groupes)
      routes.forEach(route => {
        const groupBuffer = this.groupBuffers.get(route.destination);
        if (!groupBuffer) return;

        // Mixage avec gain
        for (let i = 0; i < pcmData.length && i < groupBuffer.length; i++) {
          groupBuffer[i] += pcmData[i] * route.linearGain;
        }
      });
    });

    // Normalisation anti-clipping (soft limiter simple)
    this.groupBuffers.forEach((buffer, groupName) => {
      for (let i = 0; i < buffer.length; i++) {
        if (Math.abs(buffer[i]) > 1.0) {
          this.stats.clippingEvents++;
          buffer[i] = Math.sign(buffer[i]) * 1.0; // Hard clipping
        }
      }
    });

    this.stats.framesProcessed++;
    return this.groupBuffers;
  }

  /**
   * ÉTAPE 2 : Traite les buffers de groupe vers les sorties audio physiques
   * Distribue chaque groupe vers plusieurs canaux de sortie (avec gains individuels)
   * Support du mixage additif si plusieurs groupes vont vers la même sortie
   *
   * @param {Map<string, Float32Array>} groupBuffersData - Données PCM par groupe (depuis LiveKit)
   * @returns {Map<number, Float32Array>} Buffers de sortie par canal physique
   */
  processGroupsToOutputs(groupBuffersData) {
    // Réinitialise les buffers de sortie
    this.outputBuffers.clear();

    // Pour chaque groupe
    groupBuffersData.forEach((pcmData, groupName) => {
      const routes = this.groupToOutputRoutes.get(groupName);

      if (!routes || routes.length === 0) return;

      // Applique chaque route vers les sorties
      routes.forEach(route => {
        const outputChannel = route.destination;

        // Crée le buffer de sortie si nécessaire
        if (!this.outputBuffers.has(outputChannel)) {
          this.outputBuffers.set(outputChannel, new Float32Array(this.config.frameSize));
        }

        const outputBuffer = this.outputBuffers.get(outputChannel);

        // Mixage avec gain (additif si canal partagé)
        for (let i = 0; i < pcmData.length && i < outputBuffer.length; i++) {
          outputBuffer[i] += pcmData[i] * route.linearGain;
        }
      });
    });

    // Normalisation anti-clipping sur les sorties
    this.outputBuffers.forEach((buffer, channelId) => {
      for (let i = 0; i < buffer.length; i++) {
        if (Math.abs(buffer[i]) > 1.0) {
          this.stats.clippingEvents++;
          buffer[i] = Math.sign(buffer[i]) * 1.0; // Hard clipping
        }
      }
    });

    return this.outputBuffers;
  }

  /**
   * Récupère le buffer d'un groupe spécifique
   */
  getGroupBuffer(groupName) {
    return this.groupBuffers.get(groupName) || null;
  }

  /**
   * Récupère le buffer d'une sortie spécifique
   */
  getOutputBuffer(channelId) {
    return this.outputBuffers.get(channelId) || null;
  }

  /**
   * Récupère toutes les routes configurées
   */
  getRoutingConfig() {
    const inputToGroup = {};
    const groupToOutput = {};
    const gains = {};

    // Input -> Group
    this.inputToGroupRoutes.forEach((routes, key) => {
      const inputChannel = key.replace('in_', '');
      inputToGroup[inputChannel] = routes.map(r => r.destination);

      routes.forEach(route => {
        if (route.gain !== 0.0) {
          gains[`in_${inputChannel}_${route.destination}`] = route.gain;
        }
      });
    });

    // Group -> Output
    this.groupToOutputRoutes.forEach((routes, groupName) => {
      groupToOutput[groupName] = routes.map(r => r.destination);

      routes.forEach(route => {
        if (route.gain !== 0.0) {
          gains[`${groupName}_out_${route.destination}`] = route.gain;
        }
      });
    });

    return { inputToGroup, groupToOutput, gains };
  }

  /**
   * Récupère les statistiques
   */
  getStats() {
    return {
      framesProcessed: this.stats.framesProcessed,
      clippingEvents: this.stats.clippingEvents,
      routesActive: this.stats.routesActive,
      inputToGroupRoutes: this.inputToGroupRoutes.size,
      groupToOutputRoutes: this.groupToOutputRoutes.size,
      activeGroups: this.groupBuffers.size,
      activeOutputs: this.outputBuffers.size
    };
  }

  /**
   * Met à jour le compteur de routes actives
   */
  _updateStatsActiveRoutes() {
    let count = 0;
    this.inputToGroupRoutes.forEach(routes => count += routes.length);
    this.groupToOutputRoutes.forEach(routes => count += routes.length);
    this.stats.routesActive = count;
  }

  /**
   * Détruit le router et libère les ressources
   */
  destroy() {
    this.inputToGroupRoutes.clear();
    this.groupToOutputRoutes.clear();
    this.inputBuffers.clear();
    this.groupBuffers.clear();
    this.outputBuffers.clear();
    this.removeAllListeners();
    console.log('GroupAudioRouter détruit');
  }
}

export default GroupAudioRouter;
