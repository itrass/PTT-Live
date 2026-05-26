/**
 * ConfigManager.js
 * Gestionnaire centralisé de configuration avec support événements
 * Phase 2.5
 */

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, 'config.yaml');

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

class ConfigManager extends EventEmitter {
  constructor() {
    super();
    this.config = null;
    this.load();
  }

  /**
   * Charge la configuration depuis le fichier YAML
   */
  load() {
    try {
      const configFile = readFileSync(configPath, 'utf8');
      this.config = YAML.parse(configFile);

      // Générer les IDs pour les groupes et canaux
      this.config.groups = this.config.groups.map(group => {
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

      return this.config;
    } catch (error) {
      console.error('Erreur chargement configuration:', error);
      throw error;
    }
  }

  /**
   * Récupère la configuration actuelle
   */
  get() {
    return this.config;
  }

  /**
   * Sauvegarde la configuration dans le fichier YAML
   * Ne sauvegarde PAS les IDs (ils sont générés dynamiquement)
   */
  save(config) {
    try {
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

      // Recharger pour synchroniser
      this.load();

      // Émettre événement de changement
      this.emit('config-updated', this.config);

      return this.config;
    } catch (error) {
      console.error('Erreur sauvegarde configuration:', error);
      throw error;
    }
  }

  /**
   * Met à jour la configuration audio device
   */
  updateAudioDevice(deviceConfig) {
    try {
      console.log('📝 ConfigManager.updateAudioDevice:', deviceConfig);

      if (!this.config.audio) {
        this.config.audio = {};
      }

      if (!this.config.audio.device) {
        this.config.audio.device = {};
      }

      // Mettre à jour les paramètres fournis
      if (deviceConfig.inputDeviceId !== undefined) {
        this.config.audio.device.inputDeviceId = deviceConfig.inputDeviceId;
      }
      if (deviceConfig.outputDeviceId !== undefined) {
        this.config.audio.device.outputDeviceId = deviceConfig.outputDeviceId;
      }
      if (deviceConfig.sampleRate !== undefined) {
        this.config.audio.device.sampleRate = deviceConfig.sampleRate;
        this.config.audio.sampleRate = deviceConfig.sampleRate; // Sync avec config globale
      }
      if (deviceConfig.bufferSize !== undefined) {
        this.config.audio.device.bufferSize = deviceConfig.bufferSize;
      }

      console.log('💾 Sauvegarde configuration...');
      this.save(this.config);

      // Émettre événement spécifique
      console.log('📢 Émission événement audio-device-updated');
      this.emit('audio-device-updated', this.config.audio.device);

      console.log('✓ Configuration audio device mise à jour');
      return this.config.audio.device;
    } catch (error) {
      console.error('❌ Erreur updateAudioDevice:', error);
      throw error;
    }
  }

  /**
   * Met à jour la configuration audio globale
   */
  updateAudioConfig(audioConfig) {
    if (!this.config.audio) {
      this.config.audio = {};
    }

    if (audioConfig.sampleRate !== undefined) {
      this.config.audio.sampleRate = audioConfig.sampleRate;
    }
    if (audioConfig.defaultBitrate !== undefined) {
      this.config.audio.defaultBitrate = audioConfig.defaultBitrate;
    }
    if (audioConfig.jitterBufferMs !== undefined) {
      this.config.audio.jitterBufferMs = audioConfig.jitterBufferMs;
    }

    this.save(this.config);

    return this.config.audio;
  }
}

// Singleton
const configManager = new ConfigManager();

export default configManager;
