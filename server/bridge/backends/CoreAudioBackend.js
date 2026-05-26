/**
 * CoreAudioBackend.js
 * Backend audio natif macOS utilisant sox (Sound eXchange)
 *
 * Note: naudiodon était instable (segfaults), remplacé par sox en subprocess
 * sox est stable, installé par défaut sur macOS, et supporte toutes les cartes
 *
 * Gère :
 * - Énumération des devices audio via system_profiler
 * - Capture audio via sox (rec)
 * - Lecture audio via sox (play)
 * - Buffer circulaire pour flux continu
 */

import { spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';

export class CoreAudioBackend extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      framesPerBuffer: options.framesPerBuffer || 960,
      inputDeviceName: options.inputDeviceName || null,
      outputDeviceName: options.outputDeviceName || null,
      ...options
    };

    this.captureProcess = null;
    this.playbackProcess = null;
    this.isCapturing = false;
    this.isPlaying = false;

    // Buffer circulaire pour la lecture
    this.playbackBuffer = [];
    this.maxBufferSize = 10;
  }

  /**
   * Liste tous les devices audio disponibles via system_profiler
   * @returns {Array} Liste des devices
   */
  static getDevices() {
    try {
      const output = execSync('system_profiler SPAudioDataType -json', { encoding: 'utf8' });
      const data = JSON.parse(output);

      const devices = [];
      let id = 0;

      // Parse audio devices
      if (data.SPAudioDataType) {
        data.SPAudioDataType.forEach(item => {
          if (item._items) {
            item._items.forEach(device => {
              const name = device._name || 'Unknown Device';

              // Les clés coreaudio_device_input/output contiennent le nombre de canaux
              const inputChannels = parseInt(device.coreaudio_device_input) || 0;
              const outputChannels = parseInt(device.coreaudio_device_output) || 0;
              const sampleRate = parseInt(device.coreaudio_device_srate) || 48000;

              // Ignorer les devices sans input ni output
              if (inputChannels === 0 && outputChannels === 0) {
                return;
              }

              devices.push({
                id: id++,
                name: name,
                maxInputChannels: inputChannels,
                maxOutputChannels: outputChannels,
                defaultSampleRate: sampleRate,
                hostAPIName: 'Core Audio',
                manufacturer: device.coreaudio_device_manufacturer || 'Unknown',
                transport: device.coreaudio_device_transport || 'unknown',
                isDefault: {
                  input: device.coreaudio_default_audio_input_device === 'spaudio_yes',
                  output: device.coreaudio_default_audio_output_device === 'spaudio_yes'
                }
              });
            });
          }
        });
      }

      // Ajouter devices par défaut si liste vide
      if (devices.length === 0) {
        devices.push(
          {
            id: 0,
            name: 'Built-in Microphone',
            maxInputChannels: 1,
            maxOutputChannels: 0,
            defaultSampleRate: 48000,
            hostAPIName: 'Core Audio'
          },
          {
            id: 1,
            name: 'Built-in Output',
            maxInputChannels: 0,
            maxOutputChannels: 2,
            defaultSampleRate: 48000,
            hostAPIName: 'Core Audio'
          }
        );
      }

      console.log(`✓ CoreAudio: ${devices.length} devices détectés`);
      return devices;
    } catch (error) {
      console.error('Erreur énumération devices CoreAudio:', error);

      // Fallback : devices par défaut
      return [
        {
          id: 0,
          name: 'Built-in Microphone',
          maxInputChannels: 1,
          maxOutputChannels: 0,
          defaultSampleRate: 48000,
          hostAPIName: 'Core Audio'
        },
        {
          id: 1,
          name: 'Built-in Output',
          maxInputChannels: 0,
          maxOutputChannels: 2,
          defaultSampleRate: 48000,
          hostAPIName: 'Core Audio'
        }
      ];
    }
  }

  /**
   * Trouve le device par défaut pour l'entrée
   * @returns {Object|null} Device d'entrée par défaut
   */
  static getDefaultInputDevice() {
    try {
      const devices = this.getDevices();
      // Chercher d'abord le device marqué comme default
      const defaultDevice = devices.find(d => d.isDefault?.input && d.maxInputChannels > 0);
      if (defaultDevice) return defaultDevice;
      // Fallback: premier device avec input
      return devices.find(d => d.maxInputChannels > 0) || null;
    } catch (error) {
      console.error('Erreur getDefaultInputDevice:', error);
      return null;
    }
  }

  /**
   * Trouve le device par défaut pour la sortie
   * @returns {Object|null} Device de sortie par défaut
   */
  static getDefaultOutputDevice() {
    try {
      const devices = this.getDevices();
      // Chercher d'abord le device marqué comme default
      const defaultDevice = devices.find(d => d.isDefault?.output && d.maxOutputChannels > 0);
      if (defaultDevice) return defaultDevice;
      // Fallback: premier device avec output
      return devices.find(d => d.maxOutputChannels > 0) || null;
    } catch (error) {
      console.error('Erreur getDefaultOutputDevice:', error);
      return null;
    }
  }

  /**
   * Démarre la capture audio via sox (rec)
   * @returns {Promise<void>}
   */
  async startCapture() {
    if (this.isCapturing) {
      console.warn('Capture déjà active');
      return;
    }

    try {
      // Commande sox pour capturer audio
      // rec : enregistrer depuis input par défaut
      // -t raw : format raw PCM
      // -b 16 : 16-bit
      // -e signed-integer : signed PCM
      // -c 1 : mono (ou nombre de canaux)
      // -r 48000 : sample rate
      // - : sortie vers stdout
      const args = [
        '-t', 'coreaudio',  // Driver CoreAudio
        'default',          // Device par défaut (ou spécifier nom)
        '-t', 'raw',
        '-b', '16',
        '-e', 'signed-integer',
        `-c`, String(this.options.channels),
        `-r`, String(this.options.sampleRate),
        '-'  // Stdout
      ];

      // Si device spécifié
      if (this.options.inputDeviceName) {
        args[1] = this.options.inputDeviceName;
      }

      this.captureProcess = spawn('sox', args);

      this.captureProcess.stdout.on('data', (audioData) => {
        // Émet les données audio capturées (Buffer PCM 16-bit)
        this.emit('audioData', audioData);
      });

      this.captureProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('sox WARN')) {
          console.error('sox capture stderr:', msg);
        }
      });

      this.captureProcess.on('error', (error) => {
        console.error('Erreur processus sox capture:', error);
        this.emit('error', error);
      });

      this.captureProcess.on('close', (code) => {
        console.log(`Sox capture fermé (code ${code})`);
        this.isCapturing = false;
      });

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
    if (this.captureProcess && this.isCapturing) {
      this.captureProcess.kill('SIGTERM');
      this.captureProcess = null;
      this.isCapturing = false;
      console.log('✓ Capture audio arrêtée');
    }
  }

  /**
   * Démarre la lecture audio via sox (play)
   * @returns {Promise<void>}
   */
  async startPlayback() {
    if (this.isPlaying) {
      console.warn('Lecture déjà active');
      return;
    }

    try {
      // Commande sox pour lecture audio
      // play : lire vers output par défaut
      // -t raw : format raw PCM depuis stdin
      const args = [
        '-t', 'raw',
        '-b', '16',
        '-e', 'signed-integer',
        `-c`, String(this.options.channels),
        `-r`, String(this.options.sampleRate),
        '-',  // Stdin
        '-t', 'coreaudio',
        'default'  // Device par défaut
      ];

      // Si device spécifié
      if (this.options.outputDeviceName) {
        args[args.length - 1] = this.options.outputDeviceName;
      }

      this.playbackProcess = spawn('sox', args);

      this.playbackProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('sox WARN')) {
          console.error('sox playback stderr:', msg);
        }
      });

      this.playbackProcess.on('error', (error) => {
        console.error('Erreur processus sox playback:', error);
        this.emit('error', error);
      });

      this.playbackProcess.on('close', (code) => {
        console.log(`Sox playback fermé (code ${code})`);
        this.isPlaying = false;
      });

      this.isPlaying = true;
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
    if (this.playbackProcess && this.isPlaying) {
      this.playbackProcess.kill('SIGTERM');
      this.playbackProcess = null;
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
      if (!this.isPlaying || !this.playbackProcess) return;

      if (this.playbackBuffer.length > 0) {
        const chunk = this.playbackBuffer.shift();
        try {
          this.playbackProcess.stdin.write(chunk);
        } catch (error) {
          console.error('Erreur écriture stdin sox:', error);
        }
      } else {
        // Buffer vide : underrun (silence)
        const silenceBuffer = Buffer.alloc(this.options.framesPerBuffer * 2 * this.options.channels);
        try {
          this.playbackProcess.stdin.write(silenceBuffer);
        } catch (error) {
          // Ignore si process fermé
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
    console.log('✓ CoreAudioBackend détruit');
  }

  /**
   * Vérifie si CoreAudio/sox est disponible sur le système
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      // Vérifier si sox est installé
      execSync('which sox', { stdio: 'ignore' });
      return true;
    } catch (error) {
      // sox n'est pas installé
      console.warn('sox non installé. Installer avec : brew install sox');
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
