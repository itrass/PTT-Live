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
import LiveKitClient from './LiveKitClient.js';

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
    this.liveKitClient = null;

    // État
    this.isRunning = false;
    this.backendType = null;

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

      // 4. Connexion à LiveKit
      await this._initLiveKit();

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

    // Initialisation du backend sélectionné
    this.audioBackend = new BackendClass({
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      framesPerBuffer: this.options.frameSize,
      inputDeviceId: this.options.inputDeviceId,
      outputDeviceId: this.options.outputDeviceId,
      // Options spécifiques PipeWire
      latency: this.options.latency || 20
    });

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
   * Initialise la connexion LiveKit
   * @private
   */
  async _initLiveKit() {
    if (!this.options.liveKitToken) {
      throw new Error('Token LiveKit requis');
    }

    this.liveKitClient = new LiveKitClient({
      url: this.options.liveKitUrl,
      token: this.options.liveKitToken,
      roomName: this.options.roomName,
      participantName: 'AudioBridge',
      audioBitrate: this.opusEncoder.options.bitrate
    });

    // Events LiveKit
    this.liveKitClient.on('connected', () => {
      console.log('✓ LiveKit connecté');
    });

    this.liveKitClient.on('disconnected', ({ reason }) => {
      console.warn('⚠️  LiveKit déconnecté:', reason);
      this.stats.errors.network++;
    });

    this.liveKitClient.on('reconnecting', () => {
      console.log('🔄 LiveKit reconnexion...');
    });

    this.liveKitClient.on('audioTrackSubscribed', ({ track, participant }) => {
      console.log(`🎵 Nouveau track audio : ${participant.identity}`);
      this._handleRemoteAudioTrack(track);
    });

    await this.liveKitClient.connect();
  }

  /**
   * Démarre le routing audio bidirectionnel
   * @private
   */
  async _startAudioRouting() {
    // ===== ROUTING CAPTURE : CoreAudio → Opus → LiveKit =====
    this.audioBackend.on('audioData', (pcmData) => {
      try {
        // Encodage PCM → Opus
        const opusData = this.opusEncoder.encode(pcmData);

        if (opusData) {
          this.stats.framesCapture++;
          this.stats.bytesEncoded += opusData.length;

          // TODO: Envoyer à LiveKit via track custom ou DataChannel
          // Pour l'instant, LiveKit gère l'audio via MediaStream natif
          // Cette partie sera complétée en fonction de l'architecture finale
        } else {
          this.stats.errors.encode++;
        }
      } catch (error) {
        console.error('Erreur routing capture:', error);
        this.stats.errors.capture++;
      }
    });

    // Démarrage capture
    await this.audioBackend.startCapture();

    // ===== ROUTING LECTURE : LiveKit → Opus → CoreAudio =====
    // La lecture sera démarrée une fois qu'on reçoit des tracks distants
    await this.audioBackend.startPlayback();

    console.log('✓ Routing audio bidirectionnel actif');
  }

  /**
   * Gère l'arrivée d'un track audio distant
   * @param {RemoteAudioTrack} track - Track LiveKit
   * @private
   */
  _handleRemoteAudioTrack(track) {
    // Récupération du MediaStream du track
    const mediaStream = new MediaStream([track.mediaStreamTrack]);

    // Note: Pour décoder Opus côté serveur, on aurait besoin d'accéder
    // aux données brutes via DataChannel ou API bas niveau
    // LiveKit gère nativement le décodage WebRTC → PCM dans le navigateur

    // Pour un vrai bridge serveur, il faudrait :
    // 1. Recevoir les paquets Opus via DataChannel ou API custom
    // 2. Décoder avec opusDecoder
    // 3. Envoyer au jitterBuffer
    // 4. Lire depuis jitterBuffer vers CoreAudio

    // TODO: Implémenter réception bas niveau Opus depuis LiveKit
    console.warn('Réception track distant : implémentation complète en cours');
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

    if (this.liveKitClient) {
      await this.liveKitClient.destroy();
      this.liveKitClient = null;
    }

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
