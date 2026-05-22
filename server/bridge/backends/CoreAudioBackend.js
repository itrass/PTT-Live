/**
 * CoreAudioBackend.js
 * Backend audio natif macOS utilisant naudiodon (bindings PortAudio/CoreAudio)
 *
 * Gère :
 * - Énumération des devices audio
 * - Capture audio (microphone/carte son)
 * - Lecture audio (speakers/sortie audio)
 * - Buffer circulaire pour flux continu
 */

import portAudio from 'naudiodon';
import { EventEmitter } from 'events';

export class CoreAudioBackend extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1, // Mono par défaut
      framesPerBuffer: options.framesPerBuffer || 960, // 20ms à 48kHz
      inputDeviceId: options.inputDeviceId || null,
      outputDeviceId: options.outputDeviceId || null,
      ...options
    };

    this.inputStream = null;
    this.outputStream = null;
    this.isCapturing = false;
    this.isPlaying = false;

    // Buffer circulaire pour la lecture
    this.playbackBuffer = [];
    this.maxBufferSize = 10; // Max 10 chunks en buffer
  }

  /**
   * Liste tous les devices audio disponibles
   * @returns {Array} Liste des devices
   */
  static getDevices() {
    try {
      const devices = portAudio.getDevices();
      return devices.map((device, index) => ({
        id: index,
        name: device.name,
        maxInputChannels: device.maxInputChannels,
        maxOutputChannels: device.maxOutputChannels,
        defaultSampleRate: device.defaultSampleRate,
        hostAPIName: device.hostAPIName
      }));
    } catch (error) {
      console.error('Erreur énumération devices CoreAudio:', error);
      return [];
    }
  }

  /**
   * Trouve le device par défaut pour l'entrée
   * @returns {Object|null} Device d'entrée par défaut
   */
  static getDefaultInputDevice() {
    const devices = this.getDevices();
    return devices.find(d => d.maxInputChannels > 0) || null;
  }

  /**
   * Trouve le device par défaut pour la sortie
   * @returns {Object|null} Device de sortie par défaut
   */
  static getDefaultOutputDevice() {
    const devices = this.getDevices();
    return devices.find(d => d.maxOutputChannels > 0) || null;
  }

  /**
   * Démarre la capture audio
   * @returns {Promise<void>}
   */
  async startCapture() {
    if (this.isCapturing) {
      console.warn('Capture déjà active');
      return;
    }

    try {
      const inputConfig = {
        channelCount: this.options.channels,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate: this.options.sampleRate,
        deviceId: this.options.inputDeviceId ?? undefined,
        closeOnError: true
      };

      this.inputStream = new portAudio.AudioIO({
        inOptions: inputConfig
      });

      this.inputStream.on('data', (audioData) => {
        // Émet les données audio capturées (Buffer PCM 16-bit)
        this.emit('audioData', audioData);
      });

      this.inputStream.on('error', (error) => {
        console.error('Erreur stream capture:', error);
        this.emit('error', error);
      });

      this.inputStream.on('close', () => {
        console.log('Stream capture fermé');
        this.isCapturing = false;
      });

      this.inputStream.start();
      this.isCapturing = true;

      console.log(`✓ Capture audio démarrée : ${this.options.sampleRate}Hz, ${this.options.channels}ch`);
    } catch (error) {
      console.error('Erreur démarrage capture:', error);
      throw error;
    }
  }

  /**
   * Arrête la capture audio
   */
  stopCapture() {
    if (this.inputStream && this.isCapturing) {
      this.inputStream.quit();
      this.inputStream = null;
      this.isCapturing = false;
      console.log('✓ Capture audio arrêtée');
    }
  }

  /**
   * Démarre la lecture audio
   * @returns {Promise<void>}
   */
  async startPlayback() {
    if (this.isPlaying) {
      console.warn('Lecture déjà active');
      return;
    }

    try {
      const outputConfig = {
        channelCount: this.options.channels,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate: this.options.sampleRate,
        deviceId: this.options.outputDeviceId ?? undefined,
        closeOnError: true
      };

      this.outputStream = new portAudio.AudioIO({
        outOptions: outputConfig
      });

      this.outputStream.on('error', (error) => {
        console.error('Erreur stream lecture:', error);
        this.emit('error', error);
      });

      this.outputStream.on('close', () => {
        console.log('Stream lecture fermé');
        this.isPlaying = false;
      });

      // Démarrage du stream de lecture
      this.outputStream.start();
      this.isPlaying = true;

      // Boucle de lecture du buffer circulaire
      this._startPlaybackLoop();

      console.log(`✓ Lecture audio démarrée : ${this.options.sampleRate}Hz, ${this.options.channels}ch`);
    } catch (error) {
      console.error('Erreur démarrage lecture:', error);
      throw error;
    }
  }

  /**
   * Arrête la lecture audio
   */
  stopPlayback() {
    if (this.outputStream && this.isPlaying) {
      this.outputStream.quit();
      this.outputStream = null;
      this.isPlaying = false;
      this.playbackBuffer = [];
      console.log('✓ Lecture audio arrêtée');
    }
  }

  /**
   * Ajoute des données audio au buffer de lecture
   * @param {Buffer} audioData - Données PCM 16-bit
   */
  queueAudio(audioData) {
    if (!this.isPlaying) {
      console.warn('Tentative ajout audio alors que lecture inactive');
      return;
    }

    // Limite la taille du buffer pour éviter la latence excessive
    if (this.playbackBuffer.length < this.maxBufferSize) {
      this.playbackBuffer.push(audioData);
    } else {
      // Buffer plein : overrun
      this.emit('bufferOverrun');
    }
  }

  /**
   * Boucle de lecture du buffer circulaire
   * @private
   */
  _startPlaybackLoop() {
    const playNextChunk = () => {
      if (!this.isPlaying) return;

      if (this.playbackBuffer.length > 0) {
        const chunk = this.playbackBuffer.shift();
        this.outputStream.write(chunk);
      } else {
        // Buffer vide : underrun (on envoie du silence)
        const silenceBuffer = Buffer.alloc(this.options.framesPerBuffer * 2 * this.options.channels);
        this.outputStream.write(silenceBuffer);
        this.emit('bufferUnderrun');
      }

      // Rappel à intervalle régulier (20ms pour 960 frames à 48kHz)
      const intervalMs = (this.options.framesPerBuffer / this.options.sampleRate) * 1000;
      setTimeout(playNextChunk, intervalMs);
    };

    playNextChunk();
  }

  /**
   * Arrête tous les streams
   */
  destroy() {
    this.stopCapture();
    this.stopPlayback();
    this.removeAllListeners();
    console.log('✓ CoreAudioBackend détruit');
  }

  /**
   * Vérifie si CoreAudio est disponible sur le système
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      const devices = portAudio.getDevices();
      return devices.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtient les statistiques du backend
   * @returns {Object}
   */
  getStats() {
    return {
      capturing: this.isCapturing,
      playing: this.isPlaying,
      playbackBufferSize: this.playbackBuffer.length,
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      framesPerBuffer: this.options.framesPerBuffer
    };
  }
}

export default CoreAudioBackend;
