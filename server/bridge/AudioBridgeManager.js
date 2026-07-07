/**
 * AudioBridgeManager.js
 * Gestionnaire du bridge audio avec support hot-reload
 * Phase 2.5
 */

import { EventEmitter } from 'events';
import { AccessToken } from 'livekit-server-sdk';
import configManager from '../config/ConfigManager.js';
import deviceProfileManager from '../config/DeviceProfileManager.js';
import { CoreAudioBackend } from './backends/CoreAudioBackend.js';

class AudioBridgeManager extends EventEmitter {
  constructor() {
    super();
    this.bridge = null;
    this.isRunning = false;

    // Écouter les événements de configuration
    configManager.on('audio-device-updated', this.handleDeviceUpdate.bind(this));
    configManager.on('config-updated', this.handleConfigUpdate.bind(this));
  }

  /**
   * Démarre le bridge audio avec la configuration actuelle
   * @param {Object} options - Options de démarrage
   * @param {string} options.liveKitUrl - URL LiveKit résolue (déjà avec IP si AUTO)
   */
  async start(options = {}) {
    if (this.isRunning) {
      console.warn('⚠️  AudioBridge déjà démarré');
      return;
    }

    try {
      const config = configManager.get();
      console.log('🎵 Démarrage AudioBridge avec configuration:', config.audio);

      // Fonction pour slugifier le nom (identique à admin.js)
      const slugify = (text) => {
        return text
          .toString()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]+/g, '')
          .replace(/--+/g, '-');
      };

      // Générer un token JWT par server audio user
      const serverAudioUsers = [];

      for (const user of config.server_audio_users || []) {
        const groupId = slugify(user.group);

        const token = new AccessToken(
          config.server?.livekit?.apiKey || 'devkey',
          config.server?.livekit?.apiSecret || 'secret',
          {
            identity: `server-${user.name}`,
            name: `Server Audio - ${user.name}`,
            metadata: JSON.stringify({
              role: 'server-audio-user',
              group: groupId
            })
          }
        );

        const rawInputChannel = user.input_channel ?? user.inputChannel ?? null;
        const inputChannel = rawInputChannel !== null && rawInputChannel !== undefined ? rawInputChannel : null;
        const publish = inputChannel !== null;

        token.addGrant({
          room: groupId,
          roomJoin: true,
          canPublish: publish,
          canSubscribe: true,
          canPublishData: true
        });

        const jwt = await token.toJwt();

        const outputChannel = user.output_channel ?? user.outputChannel;

        serverAudioUsers.push({
          name: user.name,
          groupId,
          inputChannel,
          outputChannel: outputChannel !== null && outputChannel !== undefined ? outputChannel : null,
          publish,
          token: jwt
        });

        console.log(`✓ Token JWT généré pour server audio user "${user.name}" (room: ${groupId})`);
      }

      // Import dynamique du AudioBridge
      const { AudioBridge } = await import('./AudioBridge.js');

      // Préparer la config avec conversion explicite des valeurs numériques
      const audioConfig = { ...config.audio };

      // Conversion explicite des paramètres numériques (depuis YAML ils peuvent être strings)
      if (audioConfig.sampleRate) audioConfig.sampleRate = parseInt(audioConfig.sampleRate, 10);
      if (audioConfig.channels) audioConfig.channels = parseInt(audioConfig.channels, 10);

      // frameSize en millisecondes → conversion en nombre d'échantillons
      // Ex: 20ms à 48kHz = 960 échantillons
      if (audioConfig.frameSize) {
        const frameSizeMs = parseInt(audioConfig.frameSize, 10);
        const sampleRate = audioConfig.sampleRate || 48000;
        audioConfig.frameSize = Math.floor((frameSizeMs * sampleRate) / 1000);
      }

      if (audioConfig.defaultBitrate) audioConfig.defaultBitrate = parseInt(audioConfig.defaultBitrate, 10);
      if (audioConfig.customOpusBitrate) audioConfig.customOpusBitrate = parseInt(audioConfig.customOpusBitrate, 10);

      // Extraire les device IDs depuis le sous-objet device
      const inputDeviceId  = audioConfig.device?.inputDeviceId  || null;
      const outputDeviceId = audioConfig.device?.outputDeviceId || null;

      // Détecter le channel count réel depuis CoreAudio (prioritaire sur config.channels)
      let inputChannels  = parseInt(audioConfig.channels, 10) || 1;
      let outputChannels = parseInt(audioConfig.channels, 10) || 1;

      if (process.platform === 'darwin') {
        try {
          const devices = CoreAudioBackend.getDevices();
          const inputDev  = devices.find(d => d.name === inputDeviceId);
          const outputDev = devices.find(d => d.name === outputDeviceId);

          if (inputDev?.maxInputChannels  > 0) inputChannels  = inputDev.maxInputChannels;
          if (outputDev?.maxOutputChannels > 0) outputChannels = outputDev.maxOutputChannels;

          console.log(`📡 Canaux réels : entrée ${inputChannels}ch (${inputDeviceId}), sortie ${outputChannels}ch (${outputDeviceId})`);

          // Enregistrer dans le profil (ne modifie pas les noms existants)
          deviceProfileManager.recordDeviceChannels(inputDeviceId, inputChannels, outputDeviceId, outputChannels);
        } catch (e) {
          console.warn('⚠️  Détection canaux CoreAudio échouée, fallback config.channels:', e.message);
        }
      }

      // Utiliser l'URL résolue passée en option, sinon fallback config
      const liveKitUrl = options.liveKitUrl || config.server?.livekit?.url || 'ws://localhost:7880';

      // Créer l'instance avec la config
      this.bridge = new AudioBridge({
        ...audioConfig,
        channels: inputChannels,   // channel count réel du device d'entrée
        outputChannels,            // channel count réel du device de sortie
        liveKitUrl,
        serverAudioUsers,
        groups: config.groups || [],
        maxInputChannels: 32,
        maxOutputChannels: 32,
        inputDeviceId,
        outputDeviceId,
        audioLevelsServer: options.audioLevelsServer || null
      });

      // Démarrer le bridge
      await this.bridge.start();

      this.isRunning = true;
      console.log('✓ AudioBridge démarré avec succès');

      this.emit('started');
    } catch (error) {
      console.error('❌ Erreur démarrage AudioBridge:', error);
      // Ne pas throw pour éviter de bloquer le serveur si pas de carte son
      console.warn('⚠️  Le serveur continue sans AudioBridge actif');
      this.isRunning = false;
    }
  }

  /**
   * Arrête le bridge audio
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('⏹  Arrêt AudioBridge...');

      if (this.bridge) {
        await this.bridge.stop();
        this.bridge = null;
      }

      this.isRunning = false;
      console.log('✓ AudioBridge arrêté');

      this.emit('stopped');
    } catch (error) {
      console.error('❌ Erreur arrêt AudioBridge:', error);
      throw error;
    }
  }

  /**
   * Recharge le bridge avec la nouvelle configuration
   */
  async reload() {
    try {
      console.log('🔄 Rechargement AudioBridge...');

      await this.stop();
      await this.start();

      console.log('✓ AudioBridge rechargé avec succès');
      this.emit('reloaded');
    } catch (error) {
      console.error('❌ Erreur rechargement AudioBridge:', error);
      throw error;
    }
  }

  /**
   * Gestionnaire événement mise à jour device audio
   */
  async handleDeviceUpdate(deviceConfig) {
    console.log('🔧 Device audio mis à jour:', deviceConfig);
    console.log('→  Rechargement AudioBridge requis...');

    // Auto-reload du bridge
    if (this.isRunning) {
      await this.reload();
    }
  }

  /**
   * Gestionnaire événement mise à jour configuration
   */
  handleConfigUpdate(config) {
    console.log('🔧 Configuration mise à jour');
    // Peut déclencher un reload si nécessaire
  }

  /**
   * Retourne l'état actuel du bridge
   */
  getStatus() {
    return {
      running: this.isRunning,
      config: configManager.get().audio
    };
  }
}

// Singleton
const audioBridgeManager = new AudioBridgeManager();

export default audioBridgeManager;
