/**
 * AudioBridgeManager.js
 * Gestionnaire du bridge audio avec support hot-reload
 * Phase 2.5
 */

import { EventEmitter } from 'events';
import { AccessToken } from 'livekit-server-sdk';
import configManager from '../config/ConfigManager.js';

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
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️  AudioBridge déjà démarré');
      return;
    }

    try {
      const config = configManager.get();
      console.log('🎵 Démarrage AudioBridge avec configuration:', config.audio);

      // Génération du token JWT pour le participant serveur
      const token = new AccessToken(
        config.server?.livekit?.apiKey || 'devkey',
        config.server?.livekit?.apiSecret || 'secret',
        {
          identity: 'AudioBridge',
          name: 'Audio Bridge Server',
          metadata: JSON.stringify({
            role: 'bridge',
            capabilities: ['audio-routing', 'monitoring']
          })
        }
      );

      // Permissions complètes pour le bridge serveur
      token.addGrant({
        room: 'main',
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      });

      const liveKitToken = await token.toJwt();
      console.log('✓ Token JWT généré pour AudioBridge');

      // Import dynamique du AudioBridge
      const { AudioBridge } = await import('./AudioBridge.js');

      // Créer l'instance avec la config
      this.bridge = new AudioBridge({
        ...config.audio,
        // Options LiveKit
        liveKitUrl: config.server?.livekit?.url || 'ws://localhost:7880',
        liveKitToken,
        roomName: 'main',
        // Options de routing
        routing: config.audio?.routing || {},
        groups: config.groups || [],
        maxInputChannels: 32,
        maxOutputChannels: 32
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
