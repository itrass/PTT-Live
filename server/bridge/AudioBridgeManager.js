/**
 * AudioBridgeManager.js
 * Gestionnaire du bridge audio avec support hot-reload
 * Phase 2.5
 */

import { EventEmitter } from 'events';
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

      // TODO Phase 3: Implémenter le vrai bridge audio
      // const AudioBridge = await import('./AudioBridge.js');
      // this.bridge = new AudioBridge(config.audio);
      // await this.bridge.start();

      this.isRunning = true;
      console.log('✓ AudioBridge démarré (mode placeholder)');

      this.emit('started');
    } catch (error) {
      console.error('❌ Erreur démarrage AudioBridge:', error);
      throw error;
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

      // TODO Phase 3: Arrêter le vrai bridge
      // if (this.bridge) {
      //   await this.bridge.stop();
      //   this.bridge = null;
      // }

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
