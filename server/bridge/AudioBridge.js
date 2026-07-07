/**
 * AudioBridge.js
 * Classe principale du bridge audio serveur
 *
 * Orchestre :
 * - Détection et initialisation du backend audio (CoreAudio/JACK/etc.)
 * - Routing : CoreAudio → Opus → LiveKit
 * - Routing : LiveKit → Opus → CoreAudio
 * - Jitter buffer pour flux entrants
 * - Logs détaillés et statistiques
 */

import { EventEmitter } from 'events';
import { platform } from 'os';
import CoreAudioBackend from './backends/CoreAudioBackend.js';
import JACKBackend from './backends/JACKBackend.js';
import PipeWireBackend from './backends/PipeWireBackend.js';
import OpusCodec, { OpusPresets } from './OpusCodec.js';
import JitterBuffer, { JitterBufferPresets } from './JitterBuffer.js';
import ServerAudioUser from './ServerAudioUser.js';

export class AudioBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      // Configuration audio
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      frameSize: options.frameSize || 960, // 20ms à 48kHz

      // Configuration Opus
      opusPreset: options.opusPreset || 'VOICE_STANDARD',
      customOpusBitrate: options.customOpusBitrate || null,

      // Configuration JitterBuffer
      jitterBufferPreset: options.jitterBufferPreset || 'LOW_LATENCY',

      // Configuration LiveKit
      liveKitUrl: options.liveKitUrl || 'ws://localhost:7880',
      liveKitToken: options.liveKitToken || null,
      roomName: options.roomName || 'main',

      // Configuration backend
      inputDeviceId: options.inputDeviceId || null,
      outputDeviceId: options.outputDeviceId || null,

      ...options
    };

    // Composants
    this.audioBackend = null;
    this.opusEncoder = null;
    this.opusDecoder = null;
    this.jitterBuffer = null;
    this.audioLevelsServer = options.audioLevelsServer || null;

    // État
    this.isRunning = false;
    this.backendType = null;

    // Buffers pour routing multi-canaux
    this.inputChannelBuffers = new Map(); // Map<channelId, Float32Array>

    // Utilisateurs audio gérés côté serveur (participants LiveKit avec I/O physique dédiés)
    this.serverAudioUsers = new Map(); // Map<name, ServerAudioUser>

    // Pool de buffers pré-alloués pour éviter allocations répétées
    this.bufferPool = {
      float32: [], // Pool de Float32Array réutilisables
      pcm: []      // Pool de Buffer PCM réutilisables
    };
    this.maxPoolSize = 50; // Limite du pool (adapté pour 30+ clients)

    // Statistiques
    this.stats = {
      startTime: null,
      framesCapture: 0,
      framesPlayback: 0,
      bytesEncoded: 0,
      bytesDecoded: 0,
      errors: {
        capture: 0,
        playback: 0,
        encode: 0,
        decode: 0,
        network: 0
      }
    };
  }

  /**
   * Initialise et démarre le bridge audio
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn('Bridge audio déjà démarré');
      return;
    }

    console.log('🚀 Démarrage AudioBridge...');

    try {
      // 1. Détection et initialisation du backend audio
      await this._initAudioBackend();

      // 2. Initialisation des codecs Opus
      this._initOpusCodecs();

      // 3. Initialisation du jitter buffer
      this._initJitterBuffer();

      // 4. Initialisation des server audio users
      await this._initServerAudioUsers();

      // 5. Démarrage du routing audio
      await this._startAudioRouting();

      this.isRunning = true;
      this.stats.startTime = Date.now();

      console.log('✅ AudioBridge démarré avec succès');
      this.emit('started');

      // Logs périodiques
      this._startStatsLogger();
    } catch (error) {
      console.error('❌ Erreur démarrage AudioBridge:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Détecte et initialise le backend audio approprié
   * @private
   */
  async _initAudioBackend() {
    const os = platform();
    let BackendClass = null;
    let devices = [];

    // macOS : CoreAudio prioritaire
    if (os === 'darwin') {
      if (CoreAudioBackend.isAvailable()) {
        this.backendType = 'CoreAudio';
        BackendClass = CoreAudioBackend;
        console.log('✓ Backend audio : CoreAudio (macOS natif)');
      } else {
        throw new Error('CoreAudio non disponible sur ce système');
      }
    }
    // Linux : PipeWire > JACK (ordre de préférence)
    else if (os === 'linux') {
      // Détection automatique : préfère PipeWire (moderne) puis JACK (pro)
      if (PipeWireBackend.isAvailable() && PipeWireBackend.isServerRunning()) {
        this.backendType = 'PipeWire';
        BackendClass = PipeWireBackend;
        console.log('✓ Backend audio : PipeWire (Linux moderne)');
      } else if (JACKBackend.isAvailable() && JACKBackend.isServerRunning()) {
        this.backendType = 'JACK';
        BackendClass = JACKBackend;
        console.log('✓ Backend audio : JACK (Linux professionnel)');
      } else {
        // Aucun backend disponible
        const pipewireInstalled = PipeWireBackend.isAvailable();
        const jackInstalled = JACKBackend.isAvailable();

        let errorMsg = 'Aucun backend audio disponible sur Linux.\n';

        if (!pipewireInstalled && !jackInstalled) {
          errorMsg += 'Installez PipeWire (recommandé) ou JACK :\n';
          errorMsg += '  Ubuntu/Debian : sudo apt install pipewire pipewire-pulse\n';
          errorMsg += '  Arch Linux : sudo pacman -S pipewire pipewire-pulse\n';
          errorMsg += '  JACK : sudo apt install jackd2 jack-tools';
        } else if (pipewireInstalled && !PipeWireBackend.isServerRunning()) {
          errorMsg += 'PipeWire installé mais non démarré.\n';
          errorMsg += 'Démarrez-le : systemctl --user start pipewire pipewire-pulse';
        } else if (jackInstalled && !JACKBackend.isServerRunning()) {
          errorMsg += 'JACK installé mais serveur non démarré.\n';
          errorMsg += 'Démarrez-le : jackd -d alsa -r 48000';
        }

        throw new Error(errorMsg);
      }
    }
    // Windows : WASAPI (futur)
    else if (os === 'win32') {
      throw new Error('Support Windows non encore implémenté');
    }
    else {
      throw new Error(`Plateforme non supportée : ${os}`);
    }

    // Résoudre les device IDs vers les noms pour CoreAudio/sox
    let inputDeviceName = null;
    let outputDeviceName = null;

    if (this.options.inputDeviceId) {
      const inputDevice = BackendClass.getDevices().find(d => d.id === this.options.inputDeviceId);
      inputDeviceName = inputDevice ? inputDevice.name : this.options.inputDeviceId;
      console.log(`📥 Input device: "${inputDeviceName}" (ID: ${this.options.inputDeviceId})`);
    }

    if (this.options.outputDeviceId) {
      const outputDevice = BackendClass.getDevices().find(d => d.id === this.options.outputDeviceId);
      outputDeviceName = outputDevice ? outputDevice.name : this.options.outputDeviceId;
      console.log(`📤 Output device: "${outputDeviceName}" (ID: ${this.options.outputDeviceId})`);
    }

    // Initialisation du backend sélectionné
    const backendOptions = {
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      framesPerBuffer: this.options.frameSize,
      latency: this.options.latency || 20
    };

    // PipeWire utilise targetDevice, CoreAudio utilise inputDeviceName/outputDeviceName
    if (this.backendType === 'PipeWire') {
      // Pour PipeWire, on utilise inputDeviceId directement comme targetDevice
      // (startCapture et startPlayback peuvent avoir des targets différents)
      backendOptions.inputTargetDevice = this.options.inputDeviceId;
      backendOptions.outputTargetDevice = this.options.outputDeviceId;
    } else {
      // CoreAudio et autres backends
      backendOptions.inputDeviceId = this.options.inputDeviceId;
      backendOptions.inputDeviceName = inputDeviceName;
      backendOptions.outputDeviceId = this.options.outputDeviceId;
      backendOptions.outputDeviceName = outputDeviceName;
    }

    this.audioBackend = new BackendClass(backendOptions);

    // Liste des devices disponibles
    devices = BackendClass.getDevices();
    console.log(`📻 Devices audio détectés : ${devices.length}`);
    devices.forEach(d => {
      console.log(`  - ${d.name} (in:${d.maxInputChannels}, out:${d.maxOutputChannels})`);
    });
  }

  /**
   * Initialise les codecs Opus (encoder et decoder)
   * @private
   */
  _initOpusCodecs() {
    // Configuration Opus depuis preset ou custom
    let opusConfig = OpusPresets[this.options.opusPreset] || OpusPresets.VOICE_STANDARD;

    if (this.options.customOpusBitrate) {
      opusConfig = { ...opusConfig, bitrate: this.options.customOpusBitrate };
    }

    const codecOptions = {
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      frameSize: this.options.frameSize,
      ...opusConfig
    };

    // Encoder pour capture (CoreAudio → Opus → LiveKit)
    this.opusEncoder = new OpusCodec(codecOptions);

    // Decoder pour lecture (LiveKit → Opus → CoreAudio)
    this.opusDecoder = new OpusCodec(codecOptions);

    console.log(`✓ Codecs Opus : ${opusConfig.bitrate / 1000}kbps, ${this.options.sampleRate}Hz`);
  }

  /**
   * Initialise le jitter buffer
   * @private
   */
  _initJitterBuffer() {
    const bufferConfig = JitterBufferPresets[this.options.jitterBufferPreset] || JitterBufferPresets.LOW_LATENCY;

    this.jitterBuffer = new JitterBuffer(bufferConfig);

    // Events du jitter buffer
    this.jitterBuffer.on('underrun', () => {
      console.warn('⚠️  Jitter buffer underrun');
    });

    this.jitterBuffer.on('overrun', () => {
      console.warn('⚠️  Jitter buffer overrun');
    });

    this.jitterBuffer.on('adapted', ({ newTargetSize, reason }) => {
      console.log(`🔧 Jitter buffer adapté : ${newTargetSize} frames (raison: ${reason})`);
    });

    console.log(`✓ Jitter buffer : cible ${bufferConfig.targetSize} frames`);
  }

  /**
   * Initialise les utilisateurs audio serveur (participants LiveKit avec I/O physique)
   * @private
   */
  async _initServerAudioUsers() {
    const users = this.options.serverAudioUsers;
    if (!users || users.length === 0) return;

    console.log(`🎤 Initialisation ${users.length} server audio user(s)...`);

    for (const userConfig of users) {
      const user = new ServerAudioUser({
        name: userConfig.name,
        groupId: userConfig.groupId,
        inputChannel: userConfig.inputChannel,
        outputChannel: userConfig.outputChannel,
        publish: userConfig.publish !== false,
        liveKitUrl: this.options.liveKitUrl,
        token: userConfig.token,
        sampleRate: this.options.sampleRate,
        frameSize: this.options.frameSize
      });

      // Quand une frame de mix est prête, l'envoyer vers le canal physique de sortie
      const outputCh = userConfig.outputChannel;
      const groupId = userConfig.groupId;
      user.on('outputReady', (mixBuffer) => {
        // Routing physique uniquement si un canal de sortie est configuré
        if (outputCh !== null && outputCh !== undefined && this.audioBackend) {
          const numChannels = this.options.channels || 1;
          const frameSize = this.options.frameSize;

          if (numChannels <= 1) {
            const pcmBuffer = this._float32ToBuffer(mixBuffer);
            this.audioBackend.queueAudio(pcmBuffer);
          } else {
            // Construire un buffer multi-canaux avec l'audio du user sur son canal de sortie
            const interleaved = new Float32Array(frameSize * numChannels);
            for (let i = 0; i < frameSize; i++) {
              interleaved[i * numChannels + outputCh] = mixBuffer[i];
            }
            const pcmBuffer = this._float32ToBuffer(interleaved);
            this.audioBackend.queueAudio(pcmBuffer);
          }
        }

        // VU-mètres : toujours mis à jour, même sans canal de sortie physique
        if (this.audioLevelsServer) {
          this.audioLevelsServer.updateGroupLevels(new Map([[groupId, mixBuffer]]));
          if (outputCh !== null && outputCh !== undefined) {
            this.audioLevelsServer.updateOutputLevels(new Map([[outputCh, mixBuffer]]));
          }
        }
      });

      await user.start();
      this.serverAudioUsers.set(userConfig.name, user);
      const modeStr = userConfig.publish !== false
        ? `canal ${userConfig.inputChannel} → sortie canal ${userConfig.outputChannel ?? 'aucune'}`
        : `écoute seule → sortie canal ${userConfig.outputChannel ?? 'aucune'}`;
      console.log(`✓ Server audio user "${userConfig.name}" démarré (${modeStr}, room: ${userConfig.groupId})`);
    }

    console.log(`✓ ${this.serverAudioUsers.size} server audio user(s) initialisés`);
  }

  /**
   * Démarre le routing audio : capture physique → server audio users
   * @private
   */
  async _startAudioRouting() {
    console.log('🔄 Démarrage routing audio...');

    this.audioBackend.on('audioData', (pcmData) => {
      try {
        const float32Data = this._bufferToFloat32(pcmData);
        const numChannels = this.options.channels || 1;

        if (numChannels === 1) {
          this.inputChannelBuffers.set(0, float32Data);
        } else {
          const samplesPerChannel = float32Data.length / numChannels;
          for (let ch = 0; ch < numChannels; ch++) {
            const channelBuffer = new Float32Array(samplesPerChannel);
            for (let i = 0; i < samplesPerChannel; i++) {
              channelBuffer[i] = float32Data[i * numChannels + ch];
            }
            this.inputChannelBuffers.set(ch, channelBuffer);
          }
        }

        // Alimenter chaque server audio user avec son canal d'entrée
        for (const [, user] of this.serverAudioUsers) {
          const channelData = this.inputChannelBuffers.get(user.inputChannel);
          if (channelData) {
            user.sendAudio(channelData);
            // VU-mètre groupe : contribution de l'entrée physique du server user
            if (this.audioLevelsServer) {
              this.audioLevelsServer.updateGroupLevels(new Map([[user.groupId, channelData]]));
            }
          }
        }

        // VU-mètres : niveaux des entrées physiques
        if (this.audioLevelsServer) {
          this.audioLevelsServer.updateInputLevels(this.inputChannelBuffers);
        }

        this.stats.framesCapture++;
      } catch (error) {
        console.error('Erreur routing capture:', error);
        this.stats.errors.capture++;
      }
    });

    await this.audioBackend.startCapture();
    await this.audioBackend.startPlayback();

    console.log('✓ Routing audio actif');
    console.log('  → Carte Son → Server Audio Users → LiveKit → Clients');
  }

  /**
   * Acquiert un Float32Array depuis le pool ou en crée un nouveau
   * @param {number} size - Taille du buffer
   * @returns {Float32Array}
   * @private
   */
  _acquireFloat32Buffer(size) {
    const pooled = this.bufferPool.float32.find(b => b.length === size);
    if (pooled) {
      this.bufferPool.float32.splice(this.bufferPool.float32.indexOf(pooled), 1);
      return pooled;
    }
    return new Float32Array(size);
  }

  /**
   * Retourne un Float32Array au pool pour réutilisation
   * @param {Float32Array} buffer
   * @private
   */
  _releaseFloat32Buffer(buffer) {
    if (this.bufferPool.float32.length < this.maxPoolSize) {
      this.bufferPool.float32.push(buffer);
    }
  }

  /**
   * Acquiert un Buffer PCM depuis le pool ou en crée un nouveau
   * @param {number} size - Taille du buffer
   * @returns {Buffer}
   * @private
   */
  _acquirePcmBuffer(size) {
    const pooled = this.bufferPool.pcm.find(b => b.length === size);
    if (pooled) {
      this.bufferPool.pcm.splice(this.bufferPool.pcm.indexOf(pooled), 1);
      return pooled;
    }
    return Buffer.alloc(size);
  }

  /**
   * Retourne un Buffer PCM au pool pour réutilisation
   * @param {Buffer} buffer
   * @private
   */
  _releasePcmBuffer(buffer) {
    if (this.bufferPool.pcm.length < this.maxPoolSize) {
      this.bufferPool.pcm.push(buffer);
    }
  }

  /**
   * Convertit Buffer/Int16Array PCM 16-bit → Float32Array [-1.0, 1.0]
   * @param {Buffer|Int16Array|Uint8Array} buffer - Buffer PCM 16-bit signed
   * @returns {Float32Array}
   * @private
   */
  _bufferToFloat32(buffer) {
    let samples;
    let float32;

    // Cas 1 : Int16Array (LiveKit Node SDK format)
    if (buffer instanceof Int16Array) {
      samples = buffer.length;
      float32 = this._acquireFloat32Buffer(samples);

      for (let i = 0; i < samples; i++) {
        float32[i] = buffer[i] / 32768.0;
      }
      return float32;
    }

    // Cas 2 : Buffer/Uint8Array (format classique)
    if (!(buffer instanceof Buffer)) {
      buffer = Buffer.from(buffer);
    }

    samples = buffer.length / 2; // 2 bytes per sample (16-bit)
    float32 = this._acquireFloat32Buffer(samples);

    for (let i = 0; i < samples; i++) {
      // Lire 16-bit signed little-endian
      const int16 = buffer.readInt16LE(i * 2);
      // Normaliser vers [-1.0, 1.0]
      float32[i] = int16 / 32768.0;
    }

    return float32;
  }

  /**
   * Convertit Float32Array [-1.0, 1.0] → Buffer PCM 16-bit
   * @param {Float32Array} float32 - Données audio normalisées
   * @returns {Buffer}
   * @private
   */
  _float32ToBuffer(float32) {
    const buffer = this._acquirePcmBuffer(float32.length * 2); // 2 bytes per sample

    for (let i = 0; i < float32.length; i++) {
      // Clamping [-1.0, 1.0]
      const clamped = Math.max(-1.0, Math.min(1.0, float32[i]));
      // Convertir vers 16-bit signed
      const int16 = Math.round(clamped * 32767);
      buffer.writeInt16LE(int16, i * 2);
    }

    return buffer;
  }

  /**
   * Arrête le bridge audio
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Arrêt AudioBridge...');

    // Arrêt des composants
    if (this.audioBackend) {
      this.audioBackend.destroy();
      this.audioBackend = null;
    }

    // Arrêter les server audio users
    for (const [name, user] of this.serverAudioUsers.entries()) {
      console.log(`🔌 Arrêt server audio user "${name}"...`);
      await user.stop();
    }
    this.serverAudioUsers.clear();

    if (this.jitterBuffer) {
      this.jitterBuffer.destroy();
      this.jitterBuffer = null;
    }

    if (this.opusEncoder) {
      this.opusEncoder.destroy();
      this.opusEncoder = null;
    }

    if (this.opusDecoder) {
      this.opusDecoder.destroy();
      this.opusDecoder = null;
    }

    // Nettoyer les buffers
    this.inputChannelBuffers.clear();

    // Nettoyer le pool de buffers
    this.bufferPool.float32 = [];
    this.bufferPool.pcm = [];

    this.isRunning = false;

    console.log('✓ AudioBridge arrêté');
    this.emit('stopped');
  }

  /**
   * Logger de statistiques périodiques
   * @private
   */
  _startStatsLogger() {
    const logInterval = 10000; // 10s

    const logger = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(logger);
        return;
      }

      const stats = this.getStats();
      console.log('📊 Statistiques AudioBridge:');
      console.log(`  Uptime: ${Math.floor(stats.uptimeSeconds)}s`);
      console.log(`  Capture: ${stats.framesCapture} frames (${stats.errors.capture} erreurs)`);
      console.log(`  Playback: ${stats.framesPlayback} frames (${stats.errors.playback} erreurs)`);
      console.log(`  Jitter buffer: ${stats.jitterBuffer.currentBufferSize}/${stats.jitterBuffer.maxSize} (santé: ${stats.jitterBuffer.health.toFixed(1)}%)`);
      console.log(`  Codec: enc=${stats.codec.encoded}, dec=${stats.codec.decoded}`);
    }, logInterval);
  }

  /**
   * Récupère les statistiques complètes
   * @returns {Object}
   */
  getStats() {
    const uptime = this.stats.startTime ? (Date.now() - this.stats.startTime) / 1000 : 0;

    return {
      running: this.isRunning,
      backendType: this.backendType,
      uptimeSeconds: uptime,
      framesCapture: this.stats.framesCapture,
      framesPlayback: this.stats.framesPlayback,
      bytesEncoded: this.stats.bytesEncoded,
      bytesDecoded: this.stats.bytesDecoded,
      errors: { ...this.stats.errors },
      audioBackend: this.audioBackend ? this.audioBackend.getStats() : null,
      codec: this.opusEncoder ? this.opusEncoder.getStats() : null,
      jitterBuffer: this.jitterBuffer ? this.jitterBuffer.getStats() : null,
      liveKit: this.liveKitClient ? this.liveKitClient.getStats() : null
    };
  }

  /**
   * Détruit le bridge et libère toutes les ressources
   */
  async destroy() {
    await this.stop();
    this.removeAllListeners();
    console.log('✓ AudioBridge détruit');
  }
}

export default AudioBridge;
