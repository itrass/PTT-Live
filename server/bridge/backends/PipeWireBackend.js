/**
 * PipeWireBackend.js
 * Backend audio pour Linux moderne utilisant PipeWire
 *
 * PipeWire est le nouveau standard audio sur Linux (remplace PulseAudio + JACK)
 * Compatible avec : Fedora 34+, Ubuntu 22.10+, Arch Linux
 *
 * Gère :
 * - Connexion au serveur PipeWire
 * - Capture et lecture audio via pw-cat
 * - Détection automatique des devices
 * - Mode basse latence (compatible JACK)
 */

import { spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';

export class PipeWireBackend extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      framesPerBuffer: options.framesPerBuffer || 960,
      targetDevice: options.targetDevice || null,
      latency: options.latency || 20, // ms
      ...options
    };

    this.captureProcess = null;
    this.playbackProcess = null;
    this.isCapturing = false;
    this.isPlaying = false;
    this.playbackBuffer = [];
    this.maxBufferSize = 10;
  }

  /**
   * Vérifie si PipeWire est installé et disponible
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      execSync('which pw-cat', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Vérifie si le serveur PipeWire est en cours d'exécution
   * @returns {boolean}
   */
  static isServerRunning() {
    try {
      execSync('pw-cli info 0', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Liste tous les devices audio PipeWire
   * @returns {Array} Liste des devices
   */
  static getDevices() {
    if (!this.isServerRunning()) {
      console.warn('Serveur PipeWire non démarré');
      return [];
    }

    try {
      // Utilise pactl (compatible PipeWire) pour lister les devices
      const sourcesOutput = execSync('pactl list sources short', { encoding: 'utf8' });
      const sinksOutput = execSync('pactl list sinks short', { encoding: 'utf8' });

      const devices = [];

      // Parse sources (entrées)
      const sources = sourcesOutput.trim().split('\n').filter(l => l.length > 0);
      sources.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          devices.push({
            id: `pw-input-${parts[0]}`,
            name: parts[1],
            maxInputChannels: 2, // Assume stéréo par défaut
            maxOutputChannels: 0,
            defaultSampleRate: 48000,
            hostAPIName: 'PipeWire',
            type: 'source'
          });
        }
      });

      // Parse sinks (sorties)
      const sinks = sinksOutput.trim().split('\n').filter(l => l.length > 0);
      sinks.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          devices.push({
            id: `pw-output-${parts[0]}`,
            name: parts[1],
            maxInputChannels: 0,
            maxOutputChannels: 2,
            defaultSampleRate: 48000,
            hostAPIName: 'PipeWire',
            type: 'sink'
          });
        }
      });

      return devices;
    } catch (error) {
      console.error('Erreur énumération devices PipeWire:', error);
      return [];
    }
  }

  /**
   * Trouve le device par défaut pour l'entrée
   * @returns {Object|null}
   */
  static getDefaultInputDevice() {
    try {
      const output = execSync('pactl get-default-source', { encoding: 'utf8' });
      const defaultName = output.trim();

      const devices = this.getDevices();
      return devices.find(d => d.name === defaultName && d.maxInputChannels > 0) ||
             devices.find(d => d.maxInputChannels > 0);
    } catch (error) {
      const devices = this.getDevices();
      return devices.find(d => d.maxInputChannels > 0) || null;
    }
  }

  /**
   * Trouve le device par défaut pour la sortie
   * @returns {Object|null}
   */
  static getDefaultOutputDevice() {
    try {
      const output = execSync('pactl get-default-sink', { encoding: 'utf8' });
      const defaultName = output.trim();

      const devices = this.getDevices();
      return devices.find(d => d.name === defaultName && d.maxOutputChannels > 0) ||
             devices.find(d => d.maxOutputChannels > 0);
    } catch (error) {
      const devices = this.getDevices();
      return devices.find(d => d.maxOutputChannels > 0) || null;
    }
  }

  /**
   * Démarre la capture audio
   * @returns {Promise<void>}
   */
  async startCapture() {
    if (this.isCapturing) {
      console.warn('Capture PipeWire déjà active');
      return;
    }

    if (!PipeWireBackend.isServerRunning()) {
      throw new Error('Serveur PipeWire non démarré');
    }

    try {
      // Utilise pw-cat pour capturer l'audio
      const args = [
        '--record',
        '--format=s16', // 16-bit signed PCM
        `--rate=${this.options.sampleRate}`,
        `--channels=${this.options.channels}`,
        `--latency=${this.options.latency}ms`,
        '-' // Sortie vers stdout
      ];

      // Ajoute le device cible si spécifié
      if (this.options.targetDevice) {
        args.push(`--target=${this.options.targetDevice}`);
      }

      this.captureProcess = spawn('pw-cat', args);

      this.captureProcess.stdout.on('data', (audioData) => {
        this.emit('audioData', audioData);
      });

      this.captureProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('stream state changed')) {
          console.error('PipeWire capture stderr:', msg);
        }
      });

      this.captureProcess.on('error', (error) => {
        console.error('Erreur processus PipeWire capture:', error);
        this.emit('error', error);
      });

      this.captureProcess.on('close', (code) => {
        console.log(`Processus PipeWire capture fermé (code ${code})`);
        this.isCapturing = false;
      });

      this.isCapturing = true;
      console.log(`✓ Capture PipeWire démarrée : ${this.options.sampleRate}Hz, ${this.options.channels}ch`);
      console.log(`  Latence: ${this.options.latency}ms`);
    } catch (error) {
      console.error('Erreur démarrage capture PipeWire:', error);
      throw error;
    }
  }

  /**
   * Arrête la capture audio
   */
  stopCapture() {
    if (this.captureProcess && this.isCapturing) {
      this.captureProcess.kill('SIGTERM');
      this.captureProcess = null;
      this.isCapturing = false;
      console.log('✓ Capture PipeWire arrêtée');
    }
  }

  /**
   * Démarre la lecture audio
   * @returns {Promise<void>}
   */
  async startPlayback() {
    if (this.isPlaying) {
      console.warn('Lecture PipeWire déjà active');
      return;
    }

    if (!PipeWireBackend.isServerRunning()) {
      throw new Error('Serveur PipeWire non démarré');
    }

    try {
      const args = [
        '--playback',
        '--format=s16',
        `--rate=${this.options.sampleRate}`,
        `--channels=${this.options.channels}`,
        `--latency=${this.options.latency}ms`,
        '-' // Lecture depuis stdin
      ];

      if (this.options.targetDevice) {
        args.push(`--target=${this.options.targetDevice}`);
      }

      this.playbackProcess = spawn('pw-cat', args);

      this.playbackProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('stream state changed')) {
          console.error('PipeWire playback stderr:', msg);
        }
      });

      this.playbackProcess.on('error', (error) => {
        console.error('Erreur processus PipeWire playback:', error);
        this.emit('error', error);
      });

      this.playbackProcess.on('close', (code) => {
        console.log(`Processus PipeWire playback fermé (code ${code})`);
        this.isPlaying = false;
      });

      this.isPlaying = true;
      this._startPlaybackLoop();

      console.log(`✓ Lecture PipeWire démarrée : ${this.options.sampleRate}Hz, ${this.options.channels}ch`);
      console.log(`  Latence: ${this.options.latency}ms`);
    } catch (error) {
      console.error('Erreur démarrage lecture PipeWire:', error);
      throw error;
    }
  }

  /**
   * Arrête la lecture audio
   */
  stopPlayback() {
    if (this.playbackProcess && this.isPlaying) {
      this.playbackProcess.kill('SIGTERM');
      this.playbackProcess = null;
      this.isPlaying = false;
      this.playbackBuffer = [];
      console.log('✓ Lecture PipeWire arrêtée');
    }
  }

  /**
   * Ajoute des données audio au buffer de lecture
   * @param {Buffer} audioData - Données PCM 16-bit
   */
  queueAudio(audioData) {
    if (!this.isPlaying) {
      console.warn('Tentative ajout audio alors que lecture PipeWire inactive');
      return;
    }

    if (this.playbackBuffer.length < this.maxBufferSize) {
      this.playbackBuffer.push(audioData);
    } else {
      this.emit('bufferOverrun');
    }
  }

  /**
   * Boucle de lecture du buffer circulaire
   * @private
   */
  _startPlaybackLoop() {
    const playNextChunk = () => {
      if (!this.isPlaying || !this.playbackProcess) return;

      if (this.playbackBuffer.length > 0) {
        const chunk = this.playbackBuffer.shift();
        try {
          this.playbackProcess.stdin.write(chunk);
        } catch (error) {
          console.error('Erreur écriture stdin PipeWire:', error);
        }
      } else {
        // Buffer vide : underrun (silence)
        const silenceBuffer = Buffer.alloc(this.options.framesPerBuffer * 2 * this.options.channels);
        try {
          this.playbackProcess.stdin.write(silenceBuffer);
        } catch (error) {
          // Ignore si le process est fermé
        }
        this.emit('bufferUnderrun');
      }

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
    console.log('✓ PipeWireBackend détruit');
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
      framesPerBuffer: this.options.framesPerBuffer,
      latency: this.options.latency,
      pipewireServerRunning: PipeWireBackend.isServerRunning()
    };
  }

  /**
   * Obtient les informations du serveur PipeWire
   * @returns {Object}
   */
  static getServerInfo() {
    if (!this.isServerRunning()) {
      return { running: false };
    }

    try {
      const output = execSync('pw-cli info 0', { encoding: 'utf8' });

      // Parse basique des infos
      const versionMatch = output.match(/version:\s*"([^"]+)"/);

      return {
        running: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
        devices: this.getDevices().length
      };
    } catch (error) {
      return { running: true };
    }
  }
}

export default PipeWireBackend;
