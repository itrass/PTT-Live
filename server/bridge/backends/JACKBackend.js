/**
 * JACKBackend.js
 * Backend audio pour Linux utilisant JACK Audio Connection Kit
 *
 * Gère :
 * - Connexion au serveur JACK
 * - Ports audio input/output
 * - Capture et lecture audio temps réel
 * - Détection automatique du serveur JACK
 */

import { spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';

export class JACKBackend extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      framesPerBuffer: options.framesPerBuffer || 960, // 20ms à 48kHz
      clientName: options.clientName || 'PTTLive',
      autoConnect: options.autoConnect !== false,
      inputPorts: options.inputPorts || [],
      outputPorts: options.outputPorts || [],
      ...options
    };

    this.jackProcess = null;
    this.isCapturing = false;
    this.isPlaying = false;
    this.playbackBuffer = [];
    this.maxBufferSize = 10;

    // Ports JACK créés
    this.capturePort = null;
    this.playbackPort = null;
  }

  /**
   * Vérifie si JACK est installé et disponible
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      execSync('which jackd', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Vérifie si le serveur JACK est en cours d'exécution
   * @returns {boolean}
   */
  static isServerRunning() {
    try {
      execSync('jack_lsp', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Liste tous les ports JACK disponibles
   * @returns {Array} Liste des ports
   */
  static getPorts() {
    try {
      const output = execSync('jack_lsp', { encoding: 'utf8' });
      const ports = output.trim().split('\n').filter(p => p.length > 0);

      return ports.map(port => {
        const isOutput = port.includes('capture') || port.includes('output');
        const isInput = port.includes('playback') || port.includes('input');

        return {
          name: port,
          type: isOutput ? 'output' : (isInput ? 'input' : 'unknown'),
          isPhysical: port.includes('system:')
        };
      });
    } catch (error) {
      console.error('Erreur listage ports JACK:', error);
      return [];
    }
  }

  /**
   * Liste les devices audio via JACK (ports système)
   * @returns {Array} Liste des devices
   */
  static getDevices() {
    if (!this.isServerRunning()) {
      console.warn('Serveur JACK non démarré');
      return [];
    }

    try {
      const ports = this.getPorts();
      const systemPorts = ports.filter(p => p.isPhysical);

      // Grouper par device (system:capture_*, system:playback_*)
      const devices = [];

      // Ports d'entrée (capture)
      const capturePorts = systemPorts.filter(p => p.name.includes('capture'));
      if (capturePorts.length > 0) {
        devices.push({
          id: 'jack-input',
          name: 'JACK System Capture',
          maxInputChannels: capturePorts.length,
          maxOutputChannels: 0,
          defaultSampleRate: this._getServerSampleRate(),
          hostAPIName: 'JACK',
          ports: capturePorts.map(p => p.name)
        });
      }

      // Ports de sortie (playback)
      const playbackPorts = systemPorts.filter(p => p.name.includes('playback'));
      if (playbackPorts.length > 0) {
        devices.push({
          id: 'jack-output',
          name: 'JACK System Playback',
          maxInputChannels: 0,
          maxOutputChannels: playbackPorts.length,
          defaultSampleRate: this._getServerSampleRate(),
          hostAPIName: 'JACK',
          ports: playbackPorts.map(p => p.name)
        });
      }

      return devices;
    } catch (error) {
      console.error('Erreur énumération devices JACK:', error);
      return [];
    }
  }

  /**
   * Récupère le sample rate du serveur JACK
   * @returns {number}
   * @private
   */
  static _getServerSampleRate() {
    try {
      const output = execSync('jack_samplerate', { encoding: 'utf8' });
      return parseInt(output.trim()) || 48000;
    } catch (error) {
      return 48000;
    }
  }

  /**
   * Récupère la taille du buffer du serveur JACK
   * @returns {number}
   * @private
   */
  static _getServerBufferSize() {
    try {
      const output = execSync('jack_bufsize', { encoding: 'utf8' });
      return parseInt(output.trim()) || 1024;
    } catch (error) {
      return 1024;
    }
  }

  /**
   * Trouve le device par défaut pour l'entrée
   * @returns {Object|null}
   */
  static getDefaultInputDevice() {
    const devices = this.getDevices();
    return devices.find(d => d.maxInputChannels > 0) || null;
  }

  /**
   * Trouve le device par défaut pour la sortie
   * @returns {Object|null}
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
      console.warn('Capture JACK déjà active');
      return;
    }

    if (!JACKBackend.isServerRunning()) {
      throw new Error('Serveur JACK non démarré. Lancez jackd avant de continuer.');
    }

    try {
      // Utilisation de jack_rec pour capturer l'audio
      const portName = this.options.inputPorts[0] || 'system:capture_1';

      this.jackProcess = spawn('jack_rec', [
        '-f', '-', // Sortie vers stdout
        '-d', String(this.options.framesPerBuffer),
        '-b', '16', // 16-bit PCM
        portName
      ]);

      this.jackProcess.stdout.on('data', (audioData) => {
        // Émet les données audio capturées (Buffer PCM 16-bit)
        this.emit('audioData', audioData);
      });

      this.jackProcess.stderr.on('data', (data) => {
        console.error('JACK stderr:', data.toString());
      });

      this.jackProcess.on('error', (error) => {
        console.error('Erreur processus JACK:', error);
        this.emit('error', error);
      });

      this.jackProcess.on('close', () => {
        console.log('Processus JACK capture fermé');
        this.isCapturing = false;
      });

      this.isCapturing = true;
      console.log(`✓ Capture JACK démarrée : ${this.options.sampleRate}Hz, ${this.options.channels}ch`);
      console.log(`  Port: ${portName}`);
    } catch (error) {
      console.error('Erreur démarrage capture JACK:', error);
      throw error;
    }
  }

  /**
   * Arrête la capture audio
   */
  stopCapture() {
    if (this.jackProcess && this.isCapturing) {
      this.jackProcess.kill('SIGTERM');
      this.jackProcess = null;
      this.isCapturing = false;
      console.log('✓ Capture JACK arrêtée');
    }
  }

  /**
   * Démarre la lecture audio
   * @returns {Promise<void>}
   */
  async startPlayback() {
    if (this.isPlaying) {
      console.warn('Lecture JACK déjà active');
      return;
    }

    if (!JACKBackend.isServerRunning()) {
      throw new Error('Serveur JACK non démarré');
    }

    try {
      const portName = this.options.outputPorts[0] || 'system:playback_1';

      this.playbackProcess = spawn('jack_play', [
        '-f', '-', // Lecture depuis stdin
        '-b', '16', // 16-bit PCM
        portName
      ]);

      this.playbackProcess.on('error', (error) => {
        console.error('Erreur processus JACK playback:', error);
        this.emit('error', error);
      });

      this.playbackProcess.stderr.on('data', (data) => {
        console.error('JACK playback stderr:', data.toString());
      });

      this.playbackProcess.on('close', () => {
        console.log('Processus JACK playback fermé');
        this.isPlaying = false;
      });

      this.isPlaying = true;
      this._startPlaybackLoop();

      console.log(`✓ Lecture JACK démarrée : ${this.options.sampleRate}Hz, ${this.options.channels}ch`);
      console.log(`  Port: ${portName}`);
    } catch (error) {
      console.error('Erreur démarrage lecture JACK:', error);
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
      console.log('✓ Lecture JACK arrêtée');
    }
  }

  /**
   * Ajoute des données audio au buffer de lecture
   * @param {Buffer} audioData - Données PCM 16-bit
   */
  queueAudio(audioData) {
    if (!this.isPlaying) {
      console.warn('Tentative ajout audio alors que lecture JACK inactive');
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
      if (!this.isPlaying) return;

      if (this.playbackBuffer.length > 0) {
        const chunk = this.playbackBuffer.shift();
        this.playbackProcess.stdin.write(chunk);
      } else {
        // Buffer vide : underrun (silence)
        const silenceBuffer = Buffer.alloc(this.options.framesPerBuffer * 2 * this.options.channels);
        this.playbackProcess.stdin.write(silenceBuffer);
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
    console.log('✓ JACKBackend détruit');
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
      jackServerRunning: JACKBackend.isServerRunning(),
      jackSampleRate: JACKBackend._getServerSampleRate(),
      jackBufferSize: JACKBackend._getServerBufferSize()
    };
  }

  /**
   * Obtient les informations du serveur JACK
   * @returns {Object}
   */
  static getServerInfo() {
    if (!this.isServerRunning()) {
      return { running: false };
    }

    return {
      running: true,
      sampleRate: this._getServerSampleRate(),
      bufferSize: this._getServerBufferSize(),
      ports: this.getPorts().length
    };
  }
}

export default JACKBackend;
